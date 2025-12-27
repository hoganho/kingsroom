// resetAndPopulateScraperData.js
// ================================================================
// CONSOLIDATED SCRIPT: Clear scraper tables + Populate S3Storage
// ================================================================
//
// This script combines three operations into one:
// 1. Clears all scraper-related DynamoDB tables (optional)
// 2. Scans S3 bucket and populates S3Storage table
// 3. Creates/updates ScrapeURL records with latestS3Key (no separate backfill needed)
//
// ⚠️ WARNING: THIS SCRIPT CAN DELETE DATA AND IS IRREVERSIBLE.
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { S3Client, paginateListObjectsV2, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';

// ================================================================
// CONFIGURATION
// ================================================================
const CONFIG = {
  // Set to false to actually write/delete data
  DRY_RUN: false,
  
  // Set to true to clear tables before populating
  // If false, will only populate (useful for incremental updates)
  CLEAR_TABLES_FIRST: true,
  
  // S3 Configuration
  S3_BUCKET: 'pokerpro-scraper-storage',
  S3_PREFIX: 'entities/',
  
  // DynamoDB Tables
  TABLES: {
    S3_STORAGE: 'S3Storage-fosb7ek5argnhctz4odpt52eia-staging',
    SCRAPE_URL: 'ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging',
    SCRAPE_ATTEMPT: 'ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging',
    SCRAPER_JOB: 'ScraperJob-fosb7ek5argnhctz4odpt52eia-staging',
    SCRAPER_STATE: 'ScraperState-fosb7ek5argnhctz4odpt52eia-staging',
    SCRAPE_STRUCTURE: 'ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging',
  },
  
  // Tables to clear (order matters for foreign key considerations)
  TABLES_TO_CLEAR: [
    'ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging',  // Clear first (references others)
    'S3Storage-fosb7ek5argnhctz4odpt52eia-staging',
    'ScraperJob-fosb7ek5argnhctz4odpt52eia-staging',
    'ScraperState-fosb7ek5argnhctz4odpt52eia-staging',
    'ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging',
    'ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging',      // Clear last (referenced by others)
  ],
  
  // Entity URL mappings
  ENTITY_DOMAINS: {
    '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
    'f6785dbb-ab2e-4e83-8ad8-3034e7f1947b': 'https://kingslive.com.au/76-2/?id=',
    '2e782b28-06b9-42e6-a66e-bfc17d68704f': 'https://kingspoker.au/tournament/?id=',
  },
  
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
};

// ================================================================
// LOGGER
// ================================================================
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  step: (step, msg) => console.log(`\n${'='.repeat(60)}\n[STEP ${step}] ${msg}\n${'='.repeat(60)}`),
};

// ================================================================
// SETUP CLIENTS
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: CONFIG.REGION });

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

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

function parseS3Key(s3Key) {
  const regex = new RegExp(`^${CONFIG.S3_PREFIX}([^/]+)/html/(\\d+)/(.+\\.html)$`);
  const match = s3Key.match(regex);

  if (!match) return null;

  const entityId = match[1];
  const tournamentId = parseInt(match[2], 10);
  const filename = match[3];

  if (isNaN(tournamentId)) return null;

  return { entityId, tournamentId, filename };
}

function buildUrl(entityId, tournamentId) {
  const urlBase = CONFIG.ENTITY_DOMAINS[entityId];
  return `${urlBase}${tournamentId}`;
}

// ================================================================
// PHASE 1: CLEAR TABLES
// ================================================================

async function getTableKeys(tableName) {
  const command = new DescribeTableCommand({ TableName: tableName });
  const { Table } = await ddbClient.send(command);
  const keySchema = Table.KeySchema;
  const partitionKey = keySchema.find(k => k.KeyType === 'HASH').AttributeName;
  const sortKeyDef = keySchema.find(k => k.KeyType === 'RANGE');
  const sortKey = sortKeyDef ? sortKeyDef.AttributeName : undefined;
  
  return { partitionKey, sortKey };
}

async function clearTableData(tableName) {
  logger.info(`Clearing all data from table: ${tableName}`);
  
  if (CONFIG.DRY_RUN) {
    logger.info(`[DRY_RUN] Would clear table: ${tableName}`);
    return 0;
  }
  
  const { partitionKey, sortKey } = await getTableKeys(tableName);

  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: sortKey ? `${partitionKey}, ${sortKey}` : partitionKey,
    };

    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: {
              [partitionKey]: item[partitionKey],
              ...(sortKey && { [sortKey]: item[sortKey] }),
            },
          },
        }));

        let unprocessedItems = { [tableName]: deleteRequests };
        let retries = 0;
        
        while (Object.keys(unprocessedItems).length > 0 && retries < 5) {
          const batchWriteResult = await ddbDocClient.send(
            new BatchWriteCommand({ RequestItems: unprocessedItems })
          );
          unprocessedItems = batchWriteResult.UnprocessedItems || {};
          
          if (Object.keys(unprocessedItems).length > 0) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
        
        totalDeleted += batch.length;
      }
      
      logger.info(`  Deleted ${totalDeleted} items...`);
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.success(`Cleared ${totalDeleted} items from ${tableName}`);
  return totalDeleted;
}

async function clearAllTables() {
  logger.step(1, 'CLEARING SCRAPER TABLES');
  
  if (!CONFIG.CLEAR_TABLES_FIRST) {
    logger.info('Skipping table clearing (CLEAR_TABLES_FIRST = false)');
    return;
  }
  
  let totalDeleted = 0;
  
  for (const tableName of CONFIG.nnode bac[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node back[Kf[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backfill-[Kr[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backfill-recurring-game-sync-fields.js[1m [0m[K[0m [?1l>[?2004l
]2;node backfill-recurring-game-sync-fields.js]1;nodefile:///Users/hoganho/Development/kingsroom/scripts/backfill-recurring-game-sync-fields.js:17
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
                           ^

ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension and '/Users/hoganho/Development/kingsroom/package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at [90mfile:///Users/hoganho/Development/kingsroom/scripts/[39mbackfill-recurring-game-sync-fields.js:17:28
[90m    at ModuleJob.run (node:internal/modules/esm/module_job:377:25)[39m
[90m    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:671:26)[39m
[90m    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)[39m

Node.js v25.1.0
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backfill-recurring-game-sync-fields.jscjs[?1l>[?2004l
]2;node backfill-recurring-game-sync-fields.cjs]1;node============================================================
RecurringGame Sync Fields Backfill Script
============================================================
Table: undefined
Mode: LIVE

Scanning all RecurringGame records...

❌ Script failed: ValidationException: 1 validation error detected: Value null at 'tableName' failed to satisfy constraint: Member must not be null
    at ProtocolLib.getErrorSchemaOrThrowBaseException (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:69:67)
    at AwsJson1_0Protocol.handleError (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:640:65)
    at AwsJson1_0Protocol.deserializeResponse (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/protocols/index.js:467:24)
[90m    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)[39m
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/schema/index.js:26:24
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/lib-dynamodb[24m/dist-cjs/index.js:107:34
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/index.js:121:20
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/middleware-retry[24m/dist-cjs/index.js:254:46
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/middleware-logger[24m/dist-cjs/index.js:5:26
    at async scanAllRecurringGames [90m(/Users/hoganho/Development/kingsroom/scripts/[39mbackfill-recurring-game-sync-fields.cjs:51:26[90m)[39m {
  [32m'$fault'[39m: [32m'client'[39m,
  [32m'$retryable'[39m: [90mundefined[39m,
  [32m'$metadata'[39m: {
    httpStatusCode: [33m400[39m,
    requestId: [32m'LTB9LB4EOJG313G1IORFFKTGFRVV4KQNSO5AEMVJF66Q9ASUAAJG'[39m,
    extendedRequestId: [90mundefined[39m,
    cfId: [90mundefined[39m,
    attempts: [33m1[39m,
    totalRetryDelay: [33m0[39m
  },
  __type: [32m'com.amazon.coral.validate#ValidationException'[39m
}
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backfill-recurring-game-sync-fields.cjs[?1l>[?2004l
]2;node backfill-recurring-game-sync-fields.cjs]1;node============================================================
RecurringGame Sync Fields Backfill Script
============================================================
Table: undefined
Mode: LIVE

Scanning all RecurringGame records...

❌ Script failed: ValidationException: 1 validation error detected: Value null at 'tableName' failed to satisfy constraint: Member must not be null
    at ProtocolLib.getErrorSchemaOrThrowBaseException (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:69:67)
    at AwsJson1_0Protocol.handleError (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:640:65)
    at AwsJson1_0Protocol.deserializeResponse (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/protocols/index.js:467:24)
[90m    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)[39m
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/schema/index.js:26:24
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/lib-dynamodb[24m/dist-cjs/index.js:107:34
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/core[24m/dist-cjs/index.js:121:20
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@smithy/middleware-retry[24m/dist-cjs/index.js:254:46
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-dynamodb[24m/node_modules/[4m@aws-sdk/middleware-logger[24m/dist-cjs/index.js:5:26
    at async scanAllRecurringGames [90m(/Users/hoganho/Development/kingsroom/scripts/[39mbackfill-recurring-game-sync-fields.cjs:51:26[90m)[39m {
  [32m'$fault'[39m: [32m'client'[39m,
  [32m'$retryable'[39m: [90mundefined[39m,
  [32m'$metadata'[39m: {
    httpStatusCode: [33m400[39m,
    requestId: [32m'4SL2Q5P27H66AGUKBCP4F44HKVVV4KQNSO5AEMVJF66Q9ASUAAJG'[39m,
    extendedRequestId: [90mundefined[39m,
    cfId: [90mundefined[39m,
    attempts: [33m1[39m,
    totalRetryDelay: [33m0[39m
  },
  __type: [32m'com.amazon.coral.validate#ValidationException'[39m
}
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backfill-recurring-game-sync-fields.cjs[?1l>[?2004l
]2;node backfill-recurring-game-sync-fields.cjs]1;node============================================================
RecurringGame Sync Fields Backfill Script
============================================================
Table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
Mode: LIVE

Scanning all RecurringGame records...
Scanned 19 items so far...
Found 19 total records

Found 7 records with missing sync fields:

Records to be updated:
------------------------------------------------------------
1. Wenty's Wednesdays $6k-$10k GTD
   ID: b62fbde5-883d-4c05-83a1-a045133df6dd
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: 0b9c0861-c0ba-4a71-8ffc-8ad410c0c303

2. Wenty's Wednesdays $20k GTD
   ID: 318b8caa-84e1-4f53-b0fc-d5bb164f339f
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: 0b9c0861-c0ba-4a71-8ffc-8ad410c0c303

3. St.George Leagues Monday Bankroll Builder
   ID: b0449682-ddab-464a-abb4-a71b6da64f5a
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: fd4f7fb1-67fd-4398-b4b4-d85722256d45

4. Hillside Hotel Monday $4k GTD
   ID: a919f637-83d5-4c42-9308-04ee9090a67e
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: ee247836-4dbd-48a5-b4be-a514fd86eb65

5. St.George Leagues Wednesday PLO4
   ID: 89951bf0-df26-4ebf-8eb6-7ca976519f9c
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: fd4f7fb1-67fd-4398-b4b4-d85722256d45

6. St.George Leagues Friday Weekly
   ID: 3981e288-e698-4ce8-959e-d17e589d80a5
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: fd4f7fb1-67fd-4398-b4b4-d85722256d45

7. St.George Leagues Thursday Grind
   ID: 1c72a18e-8ede-488f-8933-ba2722a0cf6f
   Current _version: (empty)
   Current _lastChangedAt: (empty)
   Venue: fd4f7fb1-67fd-4398-b4b4-d85722256d45


Applying updates...
------------------------------------------------------------
✅ Updated: Wenty's Wednesdays $6k-$10k GTD
✅ Updated: Wenty's Wednesdays $20k GTD
✅ Updated: St.George Leagues Monday Bankroll Builder
✅ Updated: Hillside Hotel Monday $4k GTD
✅ Updated: St.George Leagues Wednesday PLO4
✅ Updated: St.George Leagues Friday Weekly
✅ Updated: St.George Leagues Thursday Grind

============================================================
SUMMARY
============================================================
Total records scanned: 19
Records needing update: 7
Successfully updated: 7
Failed: 0

✅ Backfill complete!

Script finished.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnnode backu[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backup[Ky[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupy[K t[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupThenClearCloudwatchLogs_perStream.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---
[WARN] ⚠️  THIS ACTION IS DESTRUCTIVE AND IRREVERSe backu[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backup[Ky[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupy[K t[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupThenClearCloudwatchLogs_perStream.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---
[WARN] � /aws/lambda/gameIdTracker-dev                 | N/A (Not Found)
 /aws/lambda/getDatabaseMetrics-dev            | N/A (Not Found)
 /aws/lambda/getModelCount-dev                 | N/A (Not Found)
 /aws/lambda/getUserMetrics-dev                | N/A (Not Found)
 /aws/lambda/playerDataProcessor-dev           | N/A (Not Found)
 /aws/lambda/publishClientMetrics-dev          | N/A (Not Found)
 /aws/lambda/recurringGameStreamTrigger-dev    | N/A (Not Found)
 /aws/lambda/refreshAllMetrics-dev             | N/A (Not Found)
 /aws/lambda/s3ManagementFunction-dev          | N/A (Not Found)
 /aws/lambda/saveGameFunction-dev              | N/A (Not Found)
 /aws/lambda/scrapeURLQuery-dev                | N/A (Not Found)
 /aws/lambda/scraperJobQuery-dev               | N/A (Not Found)
 /aws/lambda/scraperManagement-dev             | N/A (Not Found)
 /aws/lambda/socialFetcher-dev                 | N/A (Not Found)
 /aws/lambda/tournamentConsolidator-dev        | N/A (Not Found)
 /aws/lambda/userLastActiveUpdater-dev         | 1
 /aws/lambda/userManagement-dev                | N/A (Not Found)
 /aws/lambda/venueAssignmentService-dev        | N/A (Not Found)
 /aws/lambda/venueDetailsUpdater-dev           | N/A (Not Found)
 /aws/lambda/webScraperFunction-dev            | N/A (Not Found)
------------------------------------------------------------

[WARN] ⚠️  Total Streams to process: 12
[1G[0J
Type "proceed" to continue: [29G[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---
[WARN] ⚠️  THIS ACTION IS DESTRUCTIVE AND IRREVERSIBLE.
[INFO] Discovered 24 potential log groups in: /Users/hoganho/Development/kingsroom/amplify/backend/function
[INFO] Analyzing stream counts (this may take a moment)...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
[ERROR] 🛑 Unhandled failure: undefined
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---
[WARN] ⚠️  THIS ACTION IS DESTRUCTIVE AND IRREVERSIBLE.
[INFO] Discovered 24 potential log groups in: /Users/hoganho/Development/kingsroom/amplify/backend/function
[INFO] Analyzing stream counts (this may take a moment)...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
[ERROR] 🛑 Unhandled failure: undefined
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---
[WARN] ⚠️  THIS ACTION IS DESTRUCTIVE AND IRREVERSIBLE.
[INFO] Discovered 24 potential log groups in: /Users/hoganho/Development/kingsroom/amplify/backend/function
[INFO] Analyzing stream counts (this may take a moment)...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
[ERROR] 🛑 Unhandled failure: undefined
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;31m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[ERROR] 🛑 Unhandled failure: undefined
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Devenode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠�node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
FULL ERROR DETAILS: AccessDeniedException
    at AwsJson1_1Protocol.handleError (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:627:27)
[90m    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)[39m
    at async AwsJson1_1Protocol.deserializeResponse (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/protocols/index.js:467:13)
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/clFULL ERROR DETAILS: AccessDeniedException
    at AwsJson1_1Protocol.handleError (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@aws-sdk/core[24m/dist-cjs/submodules/protocols/index.js:627:27)
[90m    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)[39m
    at async AwsJson1_1Protocol.deserializeResponse (/Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/protocols/index.js:467:13)
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@smithy/core[24m/dist-cjs/submodules/schema/index.js:26:24
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@smithy/core[24m/dist-cjs/index.js:121:20
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@smithy/middleware-retry[24m/dist-cjs/index.js:254:46
    at async /Users/hoganho/Development/kingsroom/node_modules/[4m@aws-sdk/client-cloudwatch-logs[24m/node_modules/[4m@aws-sdk/middleware-logger[24m/dist-cjs/index.js:5:26
    at async getLogGroupsFromAWS [90m(file:///Users/hoganho/Development/kingsroom/scripts/[39mbackupThenClearCloudwatchLogs_perStream.js:67:22[90m)[39m
    at async main [90m(file:///Users/hoganho/Development/kingsroom/scripts/[39mbackupThenClearCloudwatchLogs_perStream.js:250:23[90m)[39m {
  [32m'$fault'[39m: [32m'client'[39m,
  [32m'$response'[39m: HttpResponse {
    statusCode: [33m400[39m,
    reason: [32m'Bad Request'[39m,
    headers: {
      [32m'x-amzn-requestid'[39m: [32m'fbe67e85-860d-459b-ba6b-8d1f0e9d84fe'[39m,
      [32m'content-type'[39m: [32m'application/x-amz-json-1.1'[39m,
      [32m'content-length'[39m: [32m'305'[39m,
      date: [32m'Sun, 21 Dec 2025 04:16:43 GMT'[39m,
      connection: [32m'close'[39m
    },
    body: IncomingMessage {
      _events: [36m[Object][39m,
      _readableState: [36m[ReadableState][39m,
      _maxListeners: [90mundefined[39m,
      socket: [36m[TLSSocket][39m,
      httpVersionMajor: [33m1[39m,
      httpVersionMinor: [33m1[39m,
      httpVersion: [32m'1.1'[39m,
      complete: [33mtrue[39m,
      rawHeaders: [36m[Array][39m,
      rawTrailers: [],
      joinDuplicateHeaders: [90mundefined[39m,
      aborted: [33mfalse[39m,
      upgrade: [33mfalse[39m,
      url: [32m''[39m,
      method: [1mnull[22m,
      statusCode: [33m400[39m,
      statusMessage: [32m'Bad Request'[39m,
      client: [36m[TLSSocket][39m,
      _consuming: [33mtrue[39m,
      _dumped: [33mfalse[39m,
      req: [36m[ClientRequest][39m,
      _eventsCount: [33m2[39m,
      [32mSymbol(shapeMode)[39m: [33mtrue[39m,
      [32mSymbol(kCapture)[39m: [33mfalse[39m,
      [32mSymbol(kHeaders)[39m: [36m[Object][39m,
      [32mSymbol(kHeadersCount)[39m: [33m10[39m,
      [32mSymbol(kTrailers)[39m: [1mnull[22m,
      [32mSymbol(kTrailersCount)[39m: [33m0[39m
    }
  },
  [32m'$retryable'[39m: [90mundefined[39m,
  [32m'$metadata'[39m: {
    httpStatusCode: [33m400[39m,
    requestId: [32m'fbe67e85-860d-4node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 12 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 4
 ...bda/entityVenueDashMetricCounter-staging   | 1
 /aws/lambda/gameDataEnricher-staging          | 2
 /aws/lambda/gameFinancialsProcessor-staging   | 1
 /aws/lambda/gameIdTracker-staging             | 16
 /aws/lambda/playerDataProcessor-staging       | 2
 ...ambda/recurringGameStreamTrigger-staging   | 5
 /aws/lambda/s3ManagementFunction-staging      | 2
 /aws/lamb[INFO] Found 12 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 4
 ...bda/entityVenueDashMetricCounter-staging   | 1
 /aws/lambda/gameDataEnricher-staging          | 2
 /aws/lambda/gameFinancialsProcessor-staging   | 1
 /aws/lambda/gameIdTracker-staging             | 16
 /aws/lambda/playerDataProcessor-staging       | 2
 ...ambda/recurringGameStreamTrigger-staging   | 5
 /aws/lambda/s3ManagementFunction-staging      | 2
 /aws/lambda/saveGameFunction-staging          | 2
 /aws/lambda/scraperManagement-staging         | 19
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/webScraperFunction-staging        | 3
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/aut[SUCCESS] ✅   └─ Saved 19 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-034803_251221-034806__2025_12_21___LATEST_feecf6c18a1b4a57b53e49e8ae466441.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 80 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 280 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251220-201247_251220-205212__2025_12_20___LATEST_b952ba2d4c6c459faabbe06fe2f53ade.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 280 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 45 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251220-051649_251220-051800__2025_12_20___LATEST_8184b7002a0f4cf4ac907843b77d86cb.json
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251220-201241_251220-201248__2025_12_20___LATEST_b7b084e55e594e38bbeab272f351b288.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 88 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProc[SUCCESS] ✅   └─ Saved 45 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251220-051649_251220-051800__2025_12_20___LATEST_8184b7002a0f4cf4ac907843b77d86cb.json
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251220-201241_251220-201248__2025_12_20___LATEST_b7b084e55e594e38bbeab272f351b288.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 88 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 9 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251220-201247_251220-201249__2025_12_20___LATEST_93b939029c1a4c60919fbde15d6cbf8f.json
[S[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-051633_251220-051643__2025_12_20___LATEST_737d674d55ba43f4a7dc884d9f071ded.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-043217_251220-043320__2025_12_20___LATEST_9b9e906e697f486fb57d297a45ad46df.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-043217_251220-043320__2025_12_20___LATEST_bb3b3c4c57174881b426e93fcc8f00d0.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-020420_251220-020422__2025_12_20___LATEST_d42741aff12b4262a533a1ac47d06c55.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-201142_251220-201212__2025_12_20___LATEST_dd91ad8ce7a84f41962ab6a20d2cab7f.json
[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-201142_251220-201251__2025_12_20___LATEST_fdf3f0d5c6bc4993afa3305b9b535501.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-030252_251221-030431__2025_12_21___LATEST_07008cfe993f4b908f39639ca94032b5.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-003209_251221-003211__2025_12_21___LATEST_10de8eac249845b78e2223c2c0a1cb04.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_l[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251220-201142_251220-201251__2025_12_20___LATEST_fdf3f0d5c6bc4993afa3305b9b535501.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-030252_251221-030431__2025_12_21___LATEST_07008cfe993f4b908f39639ca94032b5.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-003209_251221-003211__2025_12_21___LATEST_10de8eac249845b78e2223c2c0a1cb04.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-003210_251221-003212__2025_12_21___LATEST_174b9c7df061432f87ef5d053f1b15d3.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-0032[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-024533_251221-024611__2025_12_21___LATEST_d719eea161424a1299de34be7676902f.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 496 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/playerDataProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/playerDataProcessor-staging
[SUCCESS] ✅   └─ Saved 761 events → log_backup_staging_20251221/_aws_lambda_playerDataProcessor-staging/251220-201248_251220-201308__2025_12_20___LATEST_90877c33d1814cac825ce5163c0c866f.json
[SUCCESS] ✅   └─ Saved 1335 events → log_backup_staging_20251221/_aws_lambda_playerDataProcessor-staging/251220-121412_251220-121920__2025_12_20___LATEST_955fc71911814092bf7f401e5b217d85.json
[SUCCESS] ✅ Finished /aws/lambda/playerDataProcessor-staging: 2096 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/playerDataProcessor-staging
[INFO] 
--- /aws/lambda/recurringGameStreamTrigger-staging ---
[INFO] Starting backup for: /aws/lambda/recurringGameStreamTrigger-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_recurringGameStreamTrigger-staging/251221-014635_251221-014638__2025_12_21___LA[SUCCESS] ✅   └─ Saved 1335 events → log_backup_staging_20251221/_aws_lambda_playerDataProcessor-staging/251220-121412_251220-121920__2025_12_20___LATEST_955fc71911814092bf7f401e5b217d85.json
[SUCCESS] ✅ Finished /aws/lambda/playerDataProcessor-staging: 2096 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/playerDataProcessor-staging
[INFO] 
--- /aws/lambda/recurringGameStreamTrigger-staging ---
[INFO] Starting backup for: /aws/lambda/recurringGameStreamTrigger-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_recurringGameStreamTrigger-staging/251221-014635_251221-014638__2025_12_21___LATEST_18b91a3d8c2c4ff89830fe860fbbc48b.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_recurringGameStreamTrigger-staging/251221-020525_251221-020526__2025_12_21___LATEST_39ce767f671e46509d9ecb3e13d74c46.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_recurringGameStreamTrigger-staging/251221-020525_251221-020526__2025_12_21___LATEST_830bfb39c19d4724bf24276ba122ce76.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_recurringGameStreamTrigger-staging/251221-020525_251221-020526__2025_12_21___LATEST_ae8235b90005494ab4559f1864557a74.json
[SUCCESS] ✅   └─ Saved 13 events →[SUCCESS] ✅   └─ Saved 9 events → log_backup_staging_20251221/_aws_lambda_s3ManagementFunction-staging/251220-020422_251220-020423__2025_12_20___LATEST_c3b5403692d54aff8b5f61c46be3ebcb.json
[SUCCESS] ✅ Finished /aws/lambda/s3ManagementFunction-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/s3ManagementFunction-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251220-051758_251220-051800__2025_12_20___LATEST_18d3220d741c48c1898a21c8a75479d3.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251220-201245_251220-201248__2025_12_20___LATEST_54c52afcf12f4b6f8f8079c29b36b3b8.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 14 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-043215_251220-043320__2025_12_20___LATEST_0e7f964a9b134911a66e0daa2fb54ef2.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-020418_251220-020420__2025_12_20___LATEST_517cfe392e63497a87b89d51e701502d.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-020418_251220-020420__2025_12_20___LATEST_6c4da7ba608c46d18e29727624a0ba8a.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_202[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-043215_251220-043320__2025_12_20___LATEST_0e7f964a9b134911a66e0daa2fb54ef2.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-020418_251220-020420__2025_12_20___LATEST_517cfe392e63497a87b89d51e701502d.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-020418_251220-020420__2025_12_20___LATEST_6c4da7ba608c46d18e29727624a0ba8a.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-051631_251220-0[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-201138_251220-201140__2025_12_20___LATEST_da3f31661fc14334a0c18cea06833f74.json
[SUCCESS] ✅   └─ Saved 22 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251220-200015_251220-200305__2025_12_20___LATEST_dd85aa6ab7db42308090fcf7b5ebbcb4.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-030253_251221-030423__2025_12_21___LATEST_0c4cc809dc8644c182f4a39d6c1a62b3.json
[SUCCESS] ✅   └─ Saved 47 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-003208_251221-003350__2025_12_21___LATEST_3a36c5b87e1944cca74edaa9bfae044a.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-024529_251221-024640__2025_12_21___LATEST_3f7907f262b140eea50914b4073a5a1c.json
[SUCCESS] ✅   └─ Saved 89 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-034657_251221-034814__2025_12_21___LATEST_56bd75fe48dc463297392674a97f0dd5.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-034656_251221-034658__2025_12_21___LATEST_5874a6a0e2d440fca200e3ef079c122c.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-024529_251221-024640__2025_12_21___LATEST_3f7907f262b140eea50914b4073a5a1c.json
[SUCCESS] ✅   └─ Saved 89 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-034657_251221-034814__2025_12_21___LATEST_56bd75fe48dc463297392674a97f0dd5.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-034656_251221-034658__2025_12_21___LATEST_5874a6a0e2d440fca200e3ef079c122c.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-030713_251221-030713__2025_12_21___LATEST_63355b879bf942c4a205e3d4ee466163.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-003208_251221-003210__2025_12_21___LATEST_9a2c8a51f4a1447eb58e000bd02c6848.json
[SUCCESS] ✅   └─ Saved 19 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-030252_251221-030423__2025_12_21___LATEST_b369285bf0044d32bf32a20bcb4850f2.json
[SUCCESS] ✅   �[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251220-201247_251220-201248__2025_12_20___LATEST_423512b5ef2341a690dc104659a4f690.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251220-051653_251220-051720__2025_12_20___LATEST_e98d81c80fa34ee1af8e6e0b1c58d122.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 20 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251220-043533_251220-043537__2025_12_20___LATEST_3f6dd5d8c1274f3e85ba42580e8180fe.json
[SUCCESS] ✅   └─ Saved 20 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251220-201235_251220-201237__2025_12_20___LATEST_851ed99815cb438fa8ea3e071e57de7a.json
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251220-051647_251220-051649__2025_12_20___LATEST_ad50499546244433be5f85e01b01d110.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 62 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                     [SUCCESS] ✅   └─ Saved 20 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251220-201235_251220-201237__2025_12_20___LATEST_851ed99815cb438fa8ea3e071e57de7a.json
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251220-051647_251220-051649__2025node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 3 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/scraperManagement-staging         | 5
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 15 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-042924_251221-042926__2025_12_21___LATEST_9617a5893b3a46c69d0f52289f16586b.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 15 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTrackeproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 15 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-042924_251221-042926__2025_12_21___LATEST_9617a5893b3a46c69d0f52289f16586b.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 15 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-042823_251221-042910__2025_12_21___LATEST_0e5d9282e2c8402db41163378f3ab24a.json
[SUCCESS] ✅   └─ Saved 58 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-042822_251221-042825__2025_12_21___LATEST_feab7c5b06f4474088aa23db86f1b8c1.json[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-043947_251221-043949__2025_12_21___LATEST_78358f8fad304c2e9404bbe80df550ad.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-043947_251221-043949__2025_12_21___LATEST_82c40b714adf4c21b770003f3343e339.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-043949_251221-043954__2025_12_21___LATEST_df621710d4e94f1c8a96c3548e1ddc5b.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 141 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 3
 /awsnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------ceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 15 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-051141_251221-051143__2025_12_21___LATEST_1c2d5d30bdfe4cc19b739e4902133659.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 15 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 184 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-051151_251221-051151__2025_12_21___LATEST_313e9863d78e4eb8bb3e6caf7f585320.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-051816_251221-051816__2025_12_21___LATEST_4facc334624f450f92ac29b1a0486d7a.json
[SUCCESS] ✅   └─ Saved 46 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-051154_251221-051155__2025_12_21___LATEST_f653a11c56e24360aab81e13be6a7edb.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 234 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-051147_251221-051148__2025_12_21___LATEST_2[SUCCESS] ✅   └─ Saved 46 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-051154_251221-051155__2025_12_21___LATEST_f653a11c56e24360aab81e13be6a7edb.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 234 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-051147_251221-051148__2025_12_21___LATEST_256d3f4d1e8c422dac178eb799e1130b.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 48 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 49 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-051151_251221-051157__2025_12_21___LATEST_00976a2c0b21415780af06a9b034224c.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-051155_251221-051155__2025_12_21___LATEST_1478e86f4ba3406ca01125d6e982384f.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 50 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-045636_251221-045639__2025_12_21___LATEST_e92c96a614704d82bb5a6513c0da626d.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 127 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-051149_251221-051153__2025_12_21___LATEST_413f7231059e4a8da4f493ae9a06548e.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 11 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-051113_251221-051113__2025_12_21___LATEST_1b62e0cd9ed74314aea0a897dc006488.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-045636_251221-045638__2025_12_21___LATEST_3ba515b5da824093b7b3db750b7b01f0.json
[SUCCESS] ✅   └─ Saved 83 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-051112_251221-051114__2025_12_21___LATEST_58c4da4fcebe433bae3313684ae9a557.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-045637_251221-045638__2025_12_21___LATEST_93cf759909f84e7fac3511a3011fecc1.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_2025[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-045636_251221-045638__2025_12_21___LATEST_3ba515b5da824093b7b3db750b7b01f0.json
[SUCCESS] ✅   └─ Saved 83 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-051112_251221-051114__2025_12_21___LATEST_58c4da4fcebe433bae3313684ae9a557.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-045637_251221-045638__2025_12_21___LATEST_93cf759909f84e7fac3511a3011fecc1.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-045636_251221-045638__2025_12_21___LATEST_9bd1b916f298433bb93de38cbb2aad91.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 213 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 32 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-051155_251221-051157__2025_12_21___LATEST_34c5cf412a5d49349f611c7589e2b679.json
[SUCCESS] ✅   └─ Saved 4[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-051155_251221-051157__2025_12_21___LATEST_1913b1e3f44e474eaf83098df5402ac5.json
[SUCCESS] ✅   └─ Saved 214 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-051151_251221-051155__2025_12_21___LATEST_c8c4c1bfd1a7429db29ff0305a0b74a1.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 335 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 42 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-051144_251221-051146__2025_12_21___LATEST_9f335a9c878e444682157fad73218328.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 42 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /awsnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "st /aws/lambda/venueDetailsUpdater-staging       | 5
 /aws/lambda/webScraperFunction-staging        | 2
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-071024_251221-071026__2025_12_21___LATEST_0806ce2d9016460888efadc4775ec8df.json
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-065234_251221-065234__2025_12_21___LATEST_74079b0eea79408199a6f267eba6468c.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 28 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-stag[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-071024_251221-071026__2025_12_21___LATEST_0806ce2d9016460888efadc4775ec8df.json
[SUCCESS] ✅   └─[SUCCESS] ✅   └─ Saved 1554 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-052300_251221-064824__2025_12_21___LATEST_f653a11c56e24360aab81e13be6a7edb.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 1582 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-071030_251221-071036__2025_12_21___LATEST_8e25e6be42b84916803f2e72833b08a4.json
[SUCCESS] ✅   └─ Saved 45 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-065240_251221-065246__2025_12_21___LATEST_aadbe5f77ea9412db9cb716bfbbb3624.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 93 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 49 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-065244_251221-065250__2025_12_21___LATEST_1920eaae16ef40e99a1eb06fc47d65a1.json
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-065246_251221-065250__2025_12_21___LATEST_291cf40b320b452caecb7d62d17588d1.json
[SUCCESS] ✅   └─ Saved 57 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-071035_251221-071039__2025_12_21___LATEST_89813e17fabd42d7b076efb5522dfb37.json
[SUCCESS] ✅   └─ Saved 17 events → log_[SUCCESS] ✅   └─ Saved 49 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-065244_251221-065250__2025_12_21___LATEST_1920eaae16ef40e99a1eb06fc47d65a1.json
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-065246_251221-065250__2025_12_21___LATEST_291cf40b320b452caecb7d62d17588d1.json
[SUCCESS] ✅   └─ Saved 57 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-071035_251221-071039__2025_12_21___LATEST_89813e17fabd42d7b076efb5522dfb37.json
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-071038_251221-071040__2025_12_21___LATEST_c3d713adc63243c2ac171aa3498d49d3.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 140 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker[SUCCESS] ✅   └─ Saved 28 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-071012_251221-071014__2025_12_21___LATEST_a607a95dfdb147ec93243e479c8a9239.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-071014_251221-071042__2025_12_21___LATEST_e151f9d13a8248609d825a0cb2528eed.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 167 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-065242_251221-065246__2025_12_21___LATEST_5509fa34ef674031aa4352d8380028a5.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-071032_251221-071032__2025_12_21___LATEST_ae7d193c590f4d0493ed396da86deebc.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 22 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-071008_251221-071010__2025_12_21___LATEST_1bf6501e216243979c812b5d18f923b7.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-065204_251221-065204__2025_12_21___LATEST_a7d7e65eff534a87a8e056143d3ba06c.json
[SUCCESS] ✅   └─ Saved 101 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-071008_251221-071008__2025_12_21___LATEST_acb51ad8573346ddae050fb14fb8b17f.json[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-071008_251221-071010__2025_12_21___LATEST_1bf6501e216243979c812b5d18f923b7.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-065204_251221-065204__2025_12_21___LATEST_a7d7e65eff534a87a8e056143d3ba06c.json
[SUCCESS] ✅   └─ Saved 101 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-071008_251221-071008__2025_12_21___LATEST_acb51ad8573346ddae050fb14fb8b17f.json
[SUCCESS] ✅   └─ Saved 95 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-065205_251221-065252__2025_12_21___LATEST_c2ed1efab2134325882096ee1785576d.json
[SUCCESS] ✅ Finished /aws[SUCCESS] ✅   └─ Saved 56 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-071036_251221-071040__2025_12_21___LATEST_afd42ac2c0ac4443a4763deec5499bc7.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-071038_251221-071039__2025_12_21___LATEST_be7c21956a93440db547112a51c44587.json
[SUCCESS] ✅   └─ Saved 66 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-071035_251221-071037__2025_12_21___LATEST_dc1e97ea3f464d97b382a3075b925cf3.json
[SUCCESS] ✅   └─ Saved 115 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-065244_251221-065249__2025_12_21___LATEST_e853eaa5d1dd4d6ea7e4a93c59c09ec8.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 280 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071038_251221-071041__2025_12_21___LATEST_24ea1712f2c5446cbf195f059c27cf7b.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071037_251221-071039__2025_12_21___LATEST_32ab1918414e4f10a1e12cad17508f3e.json
[SUCCESS] ✅   └─ Saved 338 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071035_251221-071038__2025_12_21___LATEST_3871b1b5799543afaaeaa3f360903ae1.json
[SUCCESS] ✅   └─ Saved 181 events → log_backup_st[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071038_251221-071041__2025_12_21___LATEST_24ea1712f2c5446cbf195f059c27cf7b.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071037_251221-071039__2025_12_21___LATEST_32ab1918414e4f10a1e12cad17508f3e.json
[SUCCESS] ✅   └─ Saved 338 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-071035_251221-071038__2025_12_21___LATEST_3871b1b5799543afaaeaa3f360903ae1.json
[SUCCESS] ✅   └─ Saved 181 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-065247_251221-065250__2025_12_21___LATEST_45814229798a4daa956f8e7ea5d4048a.json
[SUCCESS] ✅   └[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-071027_251221-071029__2025_12_21___LATEST_f18796d39e86490796b0042c8a902714.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 84 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 1
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 4
 /aws/lambd[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
---------------------------------proceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-072357_251221-072359__2025_12_21___LATEST_88d6723bd5ac4db7ba0524cae1c70d32.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 14 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 336 events → log_backup_staging_20proceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-072357_251221-072359__2025_12_21___LATEST_88d6723bd5ac4db7ba0524cae1c70d32.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 14 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScrap[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-072403_251221-072404__2025_12_21___LATEST_53189fbc2b674488bb4bf79ed0761c51.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 48 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-072412_251221-072414__2025_12_21___LATEST_3485c9a571bd4ff98c922056a68ffdc9.json
[SUCCESS] ✅   └─ Saved 57 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-072407_251221-072409__2025_12_21___LATEST_6789c148957a469abe28c383c477e273.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 74 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-072331_251221-072331__2025_12_21___LATEST_c5032550f0b549329a33afa19620e022.json
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-072331_251221-072337__2025_12_21___LATEST_d97d9051c6e442d08d8a56282aa894e0.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 86 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-072405_251221-072409__2025_12_21___LATEST_0ce5bfe1d1e64f51b54cb4353b13c0cb.json
[SUCCESS[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-072331_251221-072337__2025_12_21___LATEST_d97d9051c6e442d08d8a56282aa894e0.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 86 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-072405_251221-072409__2025_12_21___LATEST_0ce5bfe1d1e64f51b54cb4353b13c0cb.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 11 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 95 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-072327_251221-072331__2025_12_21___LATEST_4aaac979dcc542e6aaf4bca86aff33c9.json
[SUCCESS] ✅   └─ [SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-072409_251221-072414__2025_12_21___LATEST_77b6520c4d8548a1aa01239577d60466.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-072411_251221-072414__2025_12_21___LATEST_cacac28d44394d8481c8c43d4dbfb65c.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-072412_251221-072412__2025_12_21___LATEST_f8a78e216c624434bae28bbb106b7440.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 140 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 278 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-072407_251221-072408__2025_12_21___LATEST_118d834ef2[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-072412_251221-072412__2025_12_21___LATEST_f8a78e216c624434bae28bbb106b7440.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 140 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 278 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-072407_251221-072408__2025_12_21___LATEST_118d834ef2c34c279554c95a6c39f378.json
[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-072410_251221-072412__2025_12_21___LATEST_ac0607151a564fc7bc19a73efdc3a118.json
[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-072410_251221-072414__2025_12_21___LATEST_f07fbbb9e8e649f1b6bc9ea4ea294bd5.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 520 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-072401_251221-072402__2025node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /awsnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatch /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/venueDetailsUpdater-staging       | 2
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-075718_251221-075720__2025_12_21___LATEST_4651f713e2fc4081933a589cf816f231.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 906 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-073344_251221-075512__2025_12_21___LATEST_3cbce41083aa41119826cbb458f31e06.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-074741_251221-074741__2025_12_21___LATEST_6918664cf8df4a2a96a9dc2301966086.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 910 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-075724_251221-075725__2025_12_21___LATEST_8c5ee13ec62044bcad540d2b4e3bb7ed.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 48 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-075731_251221-075731__2025_12_21___LATEST_46b1109659fe4a1a8[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-075724_251221-075725__2025_12_21___LATEST_8c5ee13ec62044bcad540d2b4e3bb7ed.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 48 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-075731_251221-075731__2025_12_21___LATEST_46b1109659fe4a1a847362cde2820ea0.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-075729_251221-075732__2025_12_21___LATEST_b9fd0656b6cf4e7dbbbd35003313ed87.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 42 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-075646_251221-075648__2025_12_21___LATEST_3525635b3861411f970739efadae7e02.json
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-075646_251221-075648__2025_12_21___LATEST_97b286659d3e4e66bce1507099f9bdc1.json[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 89 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-075642_251221-075644__2025_12_21___LATEST_0beaf850c21e444d8ac7c7731886f8ed.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-075642_251221-075647__2025_12_21___LATEST_1c3e526bedc747d584e0ad909768de43.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 150 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 12 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-075731_251221-075732__2025_12_21___LATEST_0a8a9abeba554fa782766fd9299ffd9c.json
[SUCCESS] ✅   └─ Saved 62 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-075729_251221-075734__2025_12_21___LATEST_f319af270dd64db3a8ce6798a36bb8ad.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 74 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-075731_251221-075734__2025_12_21___LATEST_28b21779f9[SUCCESS] ✅   └─ Saved 62 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-075729_251221-075734__2025_12_21___LATEST_f319af270dd64db3a8ce6798a36bb8ad.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 74 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └�[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-075722_251221-075724__2025_12_21___LATEST_35f82fc70c004692a90f68344d01dcb4.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 40 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 4
 /aws/lambda/gameDataEnricher-staging          | 2
 /aws/lambda/gameFinancialsProcessor-staging   | 3
 /aws/lambda/gameIdTracker-staging             | 3
 /aws/lambda/saveGameFunction-staging          | 2
 /aws/lambda/scraperManagement-staging         | 3
 /aws/lambda/tournamentConsolidator-staging    | 4
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/lambda/webScraperFunction-staging        | 2
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 34 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-093813 /aws/lambda/gameIdTracker-staging             | 3
 /aws/lambda/saveGameFunction-staging          | 2
 /aws/lambda/scraperManagement-staging         | 3
 /aws/lambda/tournamentConsolidator-staging    | 4
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 69 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-084844_251221-084844__2025_12_21___LATEST_2c5384bf98ec4075b68c7e922c826c7d.json
[SUCCESS] ✅   └─ Saved 1674 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-081111_251221-092102__2025_12_21___LATEST_3cbce41083aa41119826cbb458f31e06.json
[SUCCESS] ✅   └─ Saved 646 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-092010_251221-093243__2025_12_21___LATEST_80ae019396054d67aa7695e4b29fb86f.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-083752_251221-083752__2025_12_21___LATEST_c034cba3baf542ecad45ef103f28a23c.json
[SUCCESS] ✅ Finished /aws/la[SUCCESS] ✅   └─ Saved 1674 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-081111_251221-092102__2025_12_21___LATEST_3cbce41083aa41119826cbb458f31e06.json
[SUCCESS] ✅   └─ Saved 646 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-092010_251221-093243__2025_12_21___LATEST_80ae019396054d67aa7695e4b29fb86f.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-083752_251221-083752__2025_12_21___LATEST_c034cba3baf542ecad45ef103f28a23c.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 2328 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 73 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-091929_251221-092444__2025_12_21___LATEST_7bdac9819a2b4707b3d8b8623119bde8.json
[SUCCESS] ✅   └─ S[SUCCESS] ✅   └─ Saved 49 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-091934_251221-092446__2025_12_21___LATEST_de9bb8a53b9d42d08dccb2de17da824e.json
[SUCCESS] ✅   └─ Saved 33 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-093824_251221-093828__2025_12_21___LATEST_f9e5fb84b2574abca925866050523a5a.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 163 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 88 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-091906_251221-091941__2025_12_21___LATEST_493ade1d749b4d8ba10172e28a013059.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-091906_251221-091908__2025_12_21___LATEST_8317ffc353d140d78a965c63a122a815.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-093833_251221-093836__2025_12_21___LATEST_c0ef097a9a934ac895a679c3bcf27a1a.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 132 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-093822_251221-093826__2025_12_21___LATEST_6aa8b9cb8bac4a36b043be57a1de93c3.json
[SUCCES[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-093833_251221-093836__2025_12_21___LATEST_c0ef097a9a934ac895a679c3bcf27a1a.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 132 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-093822_251221-093826__2025_12_21___LATEST_6aa8b9cb8bac4a36b043be57a1de93c3.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-091932_251221-092444__2025_12_21___LATEST_e42cdba352c74ddea84c017a55b82a41.json
[SUCCE[SUCCESS] ✅   └─ Saved 177 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-091836_251221-092445__2025_12_21___LATEST_abda484d65c14e13aad0b48a1b364215.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 319 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 125 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-093824_251221-093830__2025_12_21___LATEST_41065bb5e3384bcfb0c2c7eea3d879b5.json
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-092445_251221-092446__2025_12_21___LATEST_5a01dbd8cbbb4f26be2434c15f93837e.json
[SUCCESS] ✅   └─ Saved 65 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-091934_251221-091934__2025_12_21___LATEST_8238b3630e4649f78b15ed302f4b10f4.json
[SUCCESS] ✅   └─ Saved 87 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-093828_251221-093830__2025_12_21___LATEST_b66f3635dfad42b886770951637437e1.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 294 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 458 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-093826_251221-093828__2025_12_21___LATEST_1ce253be4cdc4ae0a65ae2bf8a71cba4.json
[SUCCESS] ✅   └─ Saved 361 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-091934_251221-092446__2025_12_21___LATEST_2c24fe416a474e32aa7a9fc736cdf608.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 458 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-093826_251221-093828__2025_12_21___LATEST_1ce253be4cdc4ae0a65ae2bf8a71cba4.json
[SUCCESS] ✅   └─ Saved 361 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-091934_251221-092446__2025_12_21___LATEST_2c24fe416a474e32aa7a9fc736cdf608.json
[SUCCESS] ✅   └[SUCCESS] ✅   └─ Saved 83 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-093817_251221-093819__2025_12_21___LATEST_98d579b5e58148d696a2497534f20f27.json
[SUCCESS] ✅   └─ Saved 81 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-091927_251221-092443__2025_12_21___LATEST_9d3592892eaf45018009d86cc7ce3ece.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 164 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 1
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambd[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 1
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/venueDetailsUpdater-staging       | 2
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ [SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-095316_251221-095316__2025_12_21___LATEST_8efbd556170f47ee9f163b7f176a498b.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 496 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 51 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-100214_251221-100216__2025_12_21___LATEST_06fd99d0c4a049f7b72a1f90540ba6ba.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 51 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-100219_251221-100224__2025_12_21___LATEST_f8a74f99eb8d44e1b5fd274b49006ba0.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 41 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-100130_251221-100132__2025_12_21___LATEST_0036e0f89317409489f8851d63fb1ab2.json
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-100130_251221-100132__2025_12_21___LATEST_c730bf61881c4e5582b459c535adfd6a.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 86 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-100217_251221-100221__2025_12_21___LATEST_58d0ee780a384e5db38573cdface3bce.json
[SUCCESS[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-100130_251221-100132__2025_12_21___LATEST_c730bf61881c4e5582b459c535adfd6a.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 86 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-100217_251221-100221__2025_12_21___LATEST_58d0ee780a384e5db38573cdface3bce.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 11 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 97 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-100126_251221-100127__2025_12_21___LATEST_2ab853ecd8bb4809bad560e85f186ca4.json
[SUCCESS] ✅   └─ [SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-100221_251221-100222__2025_12_21___LATEST_f41057ce786a45ef977f5de41efe1373.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 78 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 181 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-100219_251221-100221__2025_12_21___LATEST_190c4652ab2c40709936c8e891ffd824.json
[SUCCESS] ✅   └─ Saved 121 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-100221_251221-100221__2025_12_21___LATEST_b1ba3d365b854831aefd14e52db180fc.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 302 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-100212_251221-100214__2025_12_21___LATEST_3107e2a5dbdc45f3b16d8f1196f4ac05.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 41 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganh[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-100212_251221-100214__2025node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 4
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 3
 /aws/lambda/gameFinancialsProcessor-staging   | 5
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/saveGameFunction-staging          | 3
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 3
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gp[ro[1A[1G[0J
Type "proceed" to continue: p[r[32G[1A[1G[0J
Type "proceed" to continue: p[[31G[1A[1G[0J
Type "proceed" to continue: p[30Groceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 64 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-103020_251221-103020__2025_12_21___LATEST_204968458af6422f8c6d313cbf89ed8b.json
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-102941_251221-102954__2025_12_21___LATEST_2ab1611af67a416ab6e4c3117a2802ff.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-104300_251221-104300__2025_12_21___LATEST_76c5cd72d
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 64 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-103020_251221-103020__2025_12_21___LATEST_204968458af6422f8c6d313cbf89ed8b.json
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-102941_251221-102954__2025_12_21___LATEST_2ab1611af67a416ab6e4c3117a2802ff.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-104300_251221-104300__2025_12_21___LATEST_76c5cd7298444c4689c31cbf54382657.json
[SUCCESS] ✅   └─[SUCCESS] ✅   └─ Saved 1134 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-100903_251221-104125__2025_12_21___LATEST_80ae019396054d67aa7695e4b29fb86f.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 1138 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 236 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-103534_251221-103536__2025_12_21___LATEST_1aadaabb30a248acb81f2cc26756f801.json
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-101050_251221-101056__2025_12_21___LATEST_4793e6503b9f4cb7a797d96d1a4771b2.json
[SUCCESS] ✅   └─ Saved 95 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-102947_251221-103025__2025_12_21___LATEST_cd86ee058f9b4e829a5531fe3e501956.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 379 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsPro[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-101050_251221-101056__2025_12_21___LATEST_4793e6503b9f4cb7a797d96d1a4771b2.json
[SUCCESS] ✅   └─ Saved 95 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-102947_251221-103025__2025_12_21___LATEST_cd86ee058f9b4e829a5531fe3e501956.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 379 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-101054_251221-101056__2025_12_21___[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-103542_251221-103542__2025_12_21___LATEST_d89006858f91478f9742907efdfb99af.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 269 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-103552_251221-103854__2025_12_21___LATEST_2134777cbadf4d24a64429c0534c5551.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-103829_251221-103829__2025_12_21___LATEST_300e7f81ad1f418c8f8809bb5e4b1514.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-101102_251221-101104__2025_12_21___LATEST_690b8351109a4e768e7337072b4bddac.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-103000_251221-103033__2025_12_21___LATEST_a4f6982bd8e74612b831ec193aa498c4.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 79 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 51 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-103536_251221-103544__2025_12_21___LATEST_45dad4bc99944d64a24669b73dd69dd7.json
[SUCCESS[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-103000_251221-103033__2025_12_21___LATEST_a4f6982bd8e74612b831ec193aa498c4.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 79 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 51 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-103536_251221-103544__2025_12_21___LATEST_45dad4bc99944d64a24669b73dd69dd7.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-101052_251221-101056__2025_12_21___LATEST_6a89023dbf6d41f19958334c6d4c87c2.json
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-102950_251221-102954__2025_12_21___LATEST_b052328cbc6543cd88ed19de117a320a.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 83 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[IN[SUCCESS] ✅   └─ Saved 77 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-103551_251221-103553__2025_12_21___LATEST_e050fae965a44bd790540476e7a8343a.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 323 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 33 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-103544_251221-103548__2025_12_21___LATEST_53ab55d4d52e479ba67c3b3e44a0b1b4.json
[SUCCESS] ✅   └─ Saved 38 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-102952_251221-103000__2025_12_21___LATEST_7aae724efca944b590a64870eeac3723.json
[SUCCESS] ✅   └─ Saved 87 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-103540_251221-103541__2025_12_21___LATEST_af8193b4967643b1bf155ac6c7a535db.json
[SUCCESS] ✅   └─ Saved 244 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-102954_251221-103548__2025_12_21___LATEST_d049cccde59f4294926dbbab23731d9e.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-101054_251221-101056__2025_12_21___LATEST_f052b96a1fbf4acc8a46e701ad1c5599.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentCons[SUCCESS] ✅   └─ Saved 87 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-103540_251221-103541__2025_12_21___LATEST_af8193b4967643b1bf155ac6c7a535db.json
[SUCCESS] ✅   └─ Saved 244 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-102954_251221-103548__2025_12_21___LATEST_d049cccde59f4294926dbbab23731d9e.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-101054_251221-101056__2025_12_21___LATEST_f052b96a1fbf4acc8a46e701ad1c5599.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 415 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 241 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-103542_251221-103547__2[SUCCESS] ✅   └─ Saved 818 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-102954_251221-103547__2025_12_21___LATEST_cdd1213e19864a12be235e87e29efd3f.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-101056_251221-101058__2025_12_21___LATEST_dc72db70c2df4755814b987cb2a64226.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 1940 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 197 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-103531_251221-103533__2025_12_21___LATEST_17d2b2979e1045b68d7cc98de9412822.json
[SUCCESS] ✅   └─ Saved 42 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-101047_251221-101055__2025_12_21___LATEST_e100d6daafc54b38bfd3df2d2e8b4e9a.json
[SUCCESS] ✅   └─ Saved 80 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-102945_251221-102945__2025_12_21___LATEST_f4aa2e249a454231b86c20f023855aa2.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 319 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                    [SUCCESS] ✅   └─ Saved 42 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-101047_251221-101055__2025_12_21___LATEST_e100d6daafc54b38bfd3df2d2e8b4e9a.json
[SUCCESS] ✅   └─ Saved 80 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-102945_251221-102945__2025_node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 3
 /awsnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) --- /aws/lambda/scraperManagement-staging         | 6
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 2
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-110742_251221-110755__2025_12_21___LATEST_8df1211abadc44a6afdb7e3530dab4fe.json
[SUCCESS] ✅   └─ Saved 24 events → log_backup_staging_20251221/_aws_lambda_autoScraper-staging/251221-112013_251221-112015__2025_12_21___LATEST_b9c87245611445138d29eca79eb3f9cb.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 41 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 304 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-112703_251221-112857__2025_12_21___LATEST_414f02567da9460d88379c46b41541e9.json
[SUCCESS] ✅   └─ Saved 750 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-105621_251221-112753__2025_12_21___LATEST_80ae019396054d67aa7695e4b29fb86f.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-112809_251221-112809__2025_12_21___LATEST_bfbf91881d0246e39efb5981eb8bcc9d.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 1058 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-110748_251221-110754__2025_12_21___LATEST_8d59142ac8a74feebb3fafa821757b31.json
[SUCCESS] ✅   └─ Saved 120 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-112019_251221-112029__2025_12_21___LATEST_f9c0efeaf3ae4bf095080e09d0d52be4.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 48 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-110748_251221-110754__2025_12_21___LATEST_8d59142ac8a74feebb3fafa821757b31.json
[SUCCESS] ✅   └─ Saved 120 events → log_backup_staging_20251221/_aws_lambda_gameDataEnricher-staging/251221-112019_251221-112029__2025_12_21___LATEST_f9c0efeaf3ae4bf095080e09d0d52be4.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 168 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 57 events → log_backup_staging_20251221/_aws_lambda_gameFinancialsProcessor-staging/251221-112023_251221-112027__2025_12_21___LATEST_1eb33b66fba04a8fbc060a007502155d.json
[SUCCESS] ✅   └─ S[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-110729_251221-110759__2025_12_21___LATEST_3c51788e03c946d4927c513ac07cd246.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251221/_aws_lambda_gameIdTracker-staging/251221-112018_251221-112020__2025_12_21___LATEST_98b4aa6629dd4f05899d05105cb841b8.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-112021_251221-112027__2025_12_21___LATEST_1bf80f181c024b7eae480ba80801f385.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-110750_251221-110754__2025_12_21___LATEST_c0568a664b234146acfd5ae699d1c51e.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 37 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 85 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-110728_251221-110815__2025_12_21___LATEST_2cd154b819fd4385ae43d2aed55399e5.js[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251221/_aws_lambda_saveGameFunction-staging/251221-110750_251221-110754__2025_12_21___LATEST_c0568a664b234146acfd5ae699d1c51e.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 37 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[I[SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-110729_251221-110750__2025_12_21___LATEST_8ee472185b73435cba15692759648991.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-112001_251221-112003__2025_12_21___LATEST_fa9d4860e2ef4b3282a6108fb40b5b0f.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251221/_aws_lambda_scraperManagement-staging/251221-110727_251221-110729__2025_12_21___LATEST_fd974426dd0645b79c57f5763cfde54e.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 242 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-110755_251221-110758__2025_12_21___LATEST_06720413208a4942bdcdf76bf2c32022.json
[SUCCESS] ✅   └─ Saved 102 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-112026_251221-112033__2025_12_21___LATEST_08e381dfaa7c4ffa9cef5573d5beb191.json
[SUCCESS] ✅   └─ Saved 99 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-112027_251221-112034__2025_12_21___LATEST_13e8c4747c8a4cf4b453dd1b4b2c6865.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-110752_251221-110758__2025_12_21___LATEST_85c529e4f80b44d394c81ce50f6d2cff.json
[SUCCESS] ✅   └─ Saved 87 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-112024_251221-112030__2025_12_21___LATEST_d6c1d66c30da45faa6b1ec3fe0db80e3.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConso[SUCCESS] ✅   └─ Saved 99 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-112027_251221-112034__2025_12_21___LATEST_13e8c4747c8a4cf4b453dd1b4b2c6865.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-110752_251221-110758__2025_12_21___LATEST_85c529e4f80b44d394c81ce50f6d2cff.json
[SUCCESS] ✅   └─ Saved 87 events → log_backup_staging_20251221/_aws_lambda_tournamentConsolidator-staging/251221-112024_251221-112030__2025_12_21___LATEST_d6c1d66c30da45faa6b1ec3fe0db80e3.json
[SUCCESS] ✅ Finished /aws[SUCCESS] ✅   └─ Saved 481 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-112023_251221-112035__2025_12_21___LATEST_aacbeb8a0f2d4e3c8cb647f12d6f34ae.json
[SUCCESS] ✅   └─ Saved 218 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-110752_251221-110758__2025_12_21___LATEST_b3234ea7f8994d5ea9b2924738604010.json
[SUCCESS] ✅   └─ Saved 301 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-112025_251221-112029__2025_12_21___LATEST_bce79269b6af460cb8971a361d5fe50f.json
[SUCCESS] ✅   └─ Saved 38 events → log_backup_staging_20251221/_aws_lambda_venueDetailsUpdater-staging/251221-110755_251221-110757__2025_12_21___LATEST_f2d9b32c88d047389eb9f537ef155060.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 1340 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-110746_251221-110753__2025_12_21___LATEST_5a2a44777a1b4653a9e62e6a6b0547c0.json
[SUCCESS] ✅   └─ Saved 98 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-112017_251221-112029__2025_12_21___LATEST_9a2474f189f349ad803c5b901c0ec23c.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 139 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                    [SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-110746_251221-110753__2025_12_21___LATEST_5a2a44777a1b4653a9e62e6a6b0547c0.json
[SUCCESS] ✅   └─ Saved 98 events → log_backup_staging_20251221/_aws_lambda_webScraperFunction-staging/251221-112017_251221-112029__2025_node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 2 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 5
 /aws/lambda/refreshAllMetrics-staging         | 7
------node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 2 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 5
 /aws/lambda/refreshAllMetrics-staging         | 7
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-115042_251221-115042__2025_12_21___LATEST_0b907359dde9460089d7e366eade7f38.json
[SUCCESS] ✅   └─ Saved 360 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-114047_251221-115506__2025_12_21___LATEST_414f02567da9460d88379c46b41541e9.json
[SUCCESS] ✅   └─ Saved 1570 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-115546_251221-124738__2025_12_21___LATEST_5e62cbf6b1d84f919afd7d0cd05911f3.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-121055_251221-121055__2025_12_21___LATEST_d5855867e68e4984916f1da946ac8b37.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251221/_aws_lambda_entityVenueDashMetricCounter-staging/251221-123140_251221-123141__2025_12_21___LATEST_fc56b46788ea4affb0f200b3b7a3675e.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 1942 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251221/_aws_lambda_refreshAllMetrics-staging/251221-123715_251221-1[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251221/_aws_lambda_refreshAllMetrics-staging/251221-121906_251221-121906__2025_12_21___LATEST_c908b4f339894a70b30eef80488e85f1.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251221/_aws_lambda_refreshAllMetrics-staging/251221-121302_251221-121303__2025_12_21___LATEST_d5ca26ca975040a4aea1934082af1cfd.json
[SUCCESS] ✅   └─ Saved 10 events → log_backup_staging_20251221/_aws_lambda_refreshAllMetrics-staging/251221-120314_251221-120315__2025_12_21___LATEST_de01c1ef731343f9b64f35840b96c3fa.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 61 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 3 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 12
 /aws/lambda/refreshAllMetrics-staging         | 1
 /awnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "stag[SUCCESS] ✅   └─ Saved 1966 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-140922_251221-153105__2025_12_21___LATEST_1247e61af6294bd38ae91d4ebdfece6a.json
[SUCCESS] ✅   └─ Saved 2944 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-165827_251221-190108__2025_12_21___LATEST_1c9a17e87eed4b299ac6fbde36c54f47.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-175629_251221-175629__2025_12_21___LATEST_1e6461bdb72e4577bb7500577857523c.json
[SUCCESS] ✅   └─ Saved 2116 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-153016_251221-165906__2025_12_21___LATEST_268695c99c384b75bc801b3accbc86d0.json
[SUCCESS] ✅   └─ Saved [SUCCESS] ✅   └─ Saved 2944 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-165827_251221-190108__2025_12_21___LATEST_1c9a17e87eed4b299ac6fbde36c54f47.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-175629_251221-175629__2025_12_21___LATEST_1e6461bdb72e4577bb7500577857523c.json
[SUCCESS] ✅   └─ Saved 2116 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-153016_251221-165906__2025_12_21___LATEST_268695c99c384b75bc801b3accbc86d0.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-211245_251221-211246__2025_12_21___LATEST_32de01c5e7ff448da3bd4d96b768d6bb.json
[SUCCESS] ✅   └─ Saved 1686 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-130009_251221-141017__2025_12_21___LATEST_5e62cbf6b1d84f919afd7d0cd05911f3.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-190303_251221-190303__2025_12_21___LATEST_5f8d8ec[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-160911_251221-160911__2025_12_21___LATEST_d2f82cfd63d04a75913006a31d49324a.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-151840_251221-151840__2025_12_21___LATEST_eb09f9aa06404210bb414dda626d1c97.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 12182 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251222/_aws_lambda_refreshAllMetrics-staging/251221-131016_251221-131018__2025_12_21___LATEST_11ce3417c7864fb896142bbf57f6f8df.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 14 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 22 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251221-200015_251221-200332__2025_12_21___LATEST_638511c37fab468a8f6cc02966819e3c.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 22 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnnode back[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node back[K
[0mbackfill-entity-venue-counters.js         
backfill-parent-records.js                
backfill-recurring-game-sync-fields.cjs   
backupDevData-csv-timestamped.js          
[JbackupThenClearCloudwatchLogs_perStream.js[J[5A[0m[27m[24m[24Cnode back[Kupd[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupDevData-csv-timestamped.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="dev", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"
[WARN] ⚠️  No tables matched your filters. Nothing to back up.
[INFO] Tupd[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupDevData-csv-timestamped.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="dev", API_ID_FILTER="fonode backupDevData-csv-timestamped.js[?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 50 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-node backupDevData-csv-timestamped.js[?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 50 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7
[INFO] Saving backups to directory: ./backup_2025-12-22_1023
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 51 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 51 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 50 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 50 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItshot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 125 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 125 items from Player-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 31 items from PlayerEntry-fosb7ek5argnhc�� backup_2025-12-22_1023/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 125 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 125 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 31 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 31 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerTi52eia-staging.csv
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 31 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 31 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Pnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1132 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 89 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 89 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 16 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 16 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1307 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-foserState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing t4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odng to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 69 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 69 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-22_1023/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-22_1023
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupDevData-csv-timestamped.js[?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 50 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-node backupDevData-csv-timestamped.js[?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 50 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreference-fosb7ek5argnhctz4odpt52eia-staging
- Venue-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "backup" to continue: [28G[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Userund 2 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 7
 /aws/lambda/refreshAllMetrics-staging         | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-235015_251221-235015__2025_12_21___LATEST_12ba270cca9d46299e8d98fabd2c9a0b.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-221905_251221-221905__2025_12_21___LATEST_33a6f70ce2ac4d22a308ec222d09a763.json
[SUCCESS] ✅   └─ Saved 3022 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-215441_251222-000655__2025_12_21___LATEST_585dc0201f6c4aacb574a07fd9cb9578.json
[SUCCESS] ✅   └─ Saved 796 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-212700_251221-220317__2025_12_21___LATEST_78761527b18b4392995d93c1f541834b.json
[SUCCESS] ✅   └─ Saved 54 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-212542_251221-212755__2025_12_21___LATEST_a06ad9b726f34ea0bdb44cbfe7c343cc.json
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-214851_251221-215520__2025_12_21___LATEST_ec1452ca909b444a842794cb8675397f.json
[SUCCESS] ✅   └─ Saved 14[SUCCESS] ✅   └─ Saved 796 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-212700_251221-220317__2025_12_21___LATEST_78761527b18b4392995d93c1f541834b.json
[SUCCESS] ✅   └─ Saved 54 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-212542_251221-212755__2025_12_21___LATEST_a06ad9b726f34ea0bdb44cbfe7c343cc.json
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251221-214851_251221-215520__2025_12_21___LATEST_ec1452ca909b444a842794cb8675397f.json
[SUCCESS] ✅   └─ Saved 1432 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-000609_251222-004938__2025_12_22___LATEST_bf05c23a7e8a4187a2ca9982e14b2d57.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 5352 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251222/_aws_lambda_refreshAllMetrics-staging/251221-213545_251221-213556__20nnode clear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node clearDevData[K[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnnnode clear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node clearDevData[K[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 51 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 51 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 50 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 50 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deletedgnhctz4odpt52eia-staging...
[INFO] Deleted 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Playergnhctz4odpt52eia-staging...
[INFO] Deleted 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 31 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 125 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 31 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 31 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 31 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 31 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 31 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 31 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5artems from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[12DbackupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 8 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/[12DbackupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 8 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameFinancialsProcessor-staging   | 4
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-stanode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 8 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/node backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 8 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameFinancialsProcessor-staging   | 4
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 27 events → log_backup_staging_20251222/_aws_lambda_autoScraper-staging/251222-023801_251222-023808__2025_12_22___LATEST_719426d2ef764f3a81ecffc136aca039.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 27 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1488 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-010816_251222-020930__2025_12_22___LATEST_bf05c23a7e8a4187a2ca9982e14b2d57.json
[SUCCESS] ✅   └─ Saved 1288 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-020840_251222-024436__2025_12_22___LATEST_dd2b8e4689034680a7acf0fb35e8b767.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 2776 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-023249_251222-023250__2025_12_22___LATEST_0df50093a0a0423eabc3c2ea3cf65766.json
[SUCCESS] ✅   └─ Saved 131 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-023249_251222-023250__2025_12_22___LATEST_203b4996765c43538e4375558cb509dc.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-023249_251222-023250__2025_12_22___LATEST_7b20e43f8a334cbe87567b93f52c7ac7.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-023249_251222-023250__2025_12_22___LATEST_b235fc5deded42039e52df62298205da.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 259 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsPr[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 23 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023738_251222-023802__2025_12_22___LATEST_60336f5c5cae4b6aa0e1f08b84cc176b.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023738_251222-023815__2025_12_22___LATEST_90db245eaf1944a5ad7c789c4c895440.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023737_251222-023740__2025_12_22___LATEST_927da34ed28049c3b37e7ef952afd244.json
[SUCCESS] ✅   └─ Saved 13 events →perManagement-staging
[SUCCESS] ✅   └─ Saved 23 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023738_251222-023802__2025_12_22___LATEST_60336f5c5cae4b6aa0e1f08b84cc176b.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023738_251222-023815__2025_12_22___LATEST_90db245eaf1944a5ad7c789c4c895440.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023737_251222-023740__2025_12_22___LATEST_927da34ed28049c3b37e7ef952afd244.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-023737_251222-023740__2025_12_22___LATEST_94b26d45212441c090918b1eca85f4d3.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 110 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 56 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-023249_251222-023250__2025_12_22___LATEST_0b36ab8b90374884b910c3e9b6c2b298.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-023250_251222-023250__2025_12_22___LATEST_1986ffbe3a374336a4cecd7572c9b5e6.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-023250_251222-023250__2025_12_22___LATEST_47a48bb0939c4f18a986cd26f18e5ec0.json
[SUCCESS] ✅   └─ Saved 91 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-023249_251222-023250__2025_12_22___LATEST_48a42d38a1e7414e86ed8871568dc038.json
[SUCCESS] ✅   └─ Saved 101 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-023249_251222-023250__2025_12_22___LATEST_9817c3c473964dcc94f74b093da696e9.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 260 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 481 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-023249_251222-023254__2025_12_22___LATEST_2eb95a38e33140ffa8adc23e619e3c6e.json
[SUCCESS] ✅   └─ Saved 699 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-023249_251222-023254__2025_12_22___LATEST_2f7601e195c1415188cc330226533aad.json
[SUCCESS] ✅   └─ Saved 243 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-023249_251222-023253__2025_12_22___LATEST_a943adfe19b647ecbfeb4ab97a63b77b.json
[SUCCESS] ✅   └─ Saved 253 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-023251_251222-023254__2025_12_22___LATEST_b6fd3735bd134cf48c97086e1f7b7c34.json
[SUCCESS] ✅   └─ Saved 510 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-023249_251222-023253__2025_12_22___L806__2025_12_22___LATEST_0a4e843da6d24a34b2337e328c5edc62.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 10
 /aws/lambda/gameDataEnricher-staging          | 1[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 10
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 1
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-staging    | 1
 /aws/lambda/venueDetailsUpdater-staging       | 1
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 78 events → log_backup_staging_20251222/_aws_lambda_autoScraper-staging/251222-030659_251222-030755__2025_12_22___LATEST_50a26e6b657240bc91a6e129a05b119a.json
[SUCCESS] ✅ Finished /aws/lambda/autoS[SUCCESS] ✅   └─ Saved 2902 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-042022_251222-062210__2025_12_22___LATEST_3e0e4fb844e34989bfa21accd43cf72b.json
[SUCCESS] ✅   └─ Saved 3280 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-062135_251222-083844__2025_12_22___LATEST_a46bb086ed34433e97d4edd424ad3b73.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-043708_251222-043708__2025_12_22___LATEST_ade5795689ff4ace9ce6887fc784295f.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-033831_251222-033831__2025_12_22___LATEST_c2272ab4622042c7b4c34e9dd62f0297.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-070427_251222-070427__2025_12_22___LATEST_c7fe1610eaff4e11bbf7b8c9b4aa6dac.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-053430_251222-053430__2025_12_22___LATEST_d9cc0d5a552b49f98112a9de3960d890.json
[SUCCESS] ✅   └─ Saved 4 even[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-033831_251222-033831__2025_12_22___LATEST_c2272ab4622042c7b4c34e9dd62f0297.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-070427_251222-070427__2025_12_22___LATEST_c7fe1610eaff4e11bbf7b8c9b4aa6dac.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-053430_251222-053430__2025_12_22___LATEST_d9cc0d5a552b49f98112a9de3960d890.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-041916_251222-041917__2025_12_22___LATEST_dbe9f376794440fb812bd6c6f5a17890.json
[SUCCESS] ✅   └─ Saved 1848 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-030333_251222-041949__2025_12_22___LATEST_dd2b8e4689034680a7acf0fb35e8b767.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 10224 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 209 events → log_backup_staging_20251222/_aws_lambda_gameDataEnricher-staging/251222-030705_251222-030755__2025_12_22___LATEST_bcbfcf170fc64ccc9d51875af2a3816a.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 209 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 57 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-030710_251222-030755__2025_12_22___LATEST_9d58fa84af21498891b99d6502c577df.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 70 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-030632_251222-030800__2025_12_22___LATEST_067968c7bae64ee997a616fea967b99b.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-100229_251222-100231__2025_12_22___LATEST_7e9df16cf58d49f09bda588db4542b3f.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-030632_251222-030646__2025_12_22___LATEST_b46af18551f84597b178ae818c6d52c6.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-100229_251222-100231__2025_12_22___LATEST_c04a91a3c7e843f4a1705f3715ee05e7.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 133 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUC[SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-030630_251222-030700__2025_12_22___LATEST_7ed2f9de551a4a549ada4076ad36a70d.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-100226_251222-100227__2025_12_22___LATEST_d25fc91012994d3f90d4cf2050572c8c.json
[SUCCESS] ✅   └─ Saved 189 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-030630_251222-030802__2025_12_22___LATEST_f8b43ff93ce84869b5e3c6e6c02fa662.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 262 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 43 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-030710_251222-030755__2025_12_22___LATEST_be628796dafa4b33867b936d1cd8ad21.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 43 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 417 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-030710_251222-030755__2025_12_22___LATEST_457c6b36216446c6808fc19a8c9c5034.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 417 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 320 events → log_backup_staging_20251222/_aws_lambda_webScraperFunction-staging/251222-030702_251222-030754__2025_12_22___LATEST_ffb12624d7634747bdde058e103516a9.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 320 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hlls[?1l>[?2004l
]2;ls -G]1;ls[31manalyze-refactor.sh[39;49m[0m
backfill-entity-venue-counters.js
backfill-parent-records.js
backfill-recurring-game-sync-fields.cjs
[1m[36mbackup_2025-12-22_1023[39;49m[0m
backupDevData-csv-timestamped.js
backupThenClearCloudwatchLogs_perStream.js
clearDevData-social.js
clearDevData.js
create-seed-recurringgames.mjs
interactiveSqsReceiver_DrainQueue.js
KingsRooom-Recurring.csv
[1m[36mlog_backup_staging_20251222[39;49m[0m
recurring_games_seed.json
refactor-analysis-20251208-153024.txt
resetAndPopulateScraperData.js
restoreToStaging.js
[31mseed-admin-user.sh[39;49m[0m
[31mseedlls[?1l>[?2004l
]2;ls -G]1;ls[31manalyze-refactor.sh[39;49m[0m
backfill-entity-venue-counters.js
backfill-parent-records.js
backfill-recurring-game-sync-fields.cjs
[1m[36mbackup_2025-12-22_1023[39;49m[0m
backupDevData-csv-timestamped.js
backupThenClearCloudwatchLogs_perStream.js
clearDevData-social.js
clearDevData.js
create-seed-recurringgames.mjs
interactiveSqsReceiver_DrainQueue.js
KingsRooom-Recurring.csv
[1m[36mlog_backup_staging_20251222[39;49m[0m
recurring_gamnnode clear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node clear[K
[J[0mclearDevData-social.js   [JclearDevData.js          [JclearScraperMetadata.js[J[A[0m[27m[24m[24Cnode clear[Kd[?7l[31m…[39m[?7h
[J[A[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node clearDevData[K[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from GameCost-fosb7ek5argnhctz4odpt52eia-stagi
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[Iing
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfullynhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scriS[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node clearScraperMetadata.js[1m [0m[K[0m [?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  DRY_RUN MODE - No data will be deleted

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 111 items
  ScraperJob: 26 items
  ScraperState: 1 items
  ScrapeStructure: 19 items
  ScrapeURL: 1,739 items

  TOTAL: 1,896 items to delete

------------------------------------------------------------

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] [DRY_RUN] Would delete 111 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] [DRY_RUN] Would delete 26 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] [DRY_RUN] Would delete 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] [DRY_RUN] Would delete 19 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] [DRY_RUN] Would delete 1739 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ DRY RUN complete. Would have deleted 1,896 items.
[INFO] Set DRY_RUN = false to actually delete.
============================================================

[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hccode cl[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K
[J[0mclearDevData-social.js   [JclearDevData.js          [JclearScraperMetadata.js[J[A[0m[27m[24m[24Ccode clear[Ks[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clearScraperMetadata.js[1m [0m[K[0m [?1l>[?2004l
]2;code clearScraperMetadata.js]1;code[1m[7m%[27m[1m[0m                   de cl[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K
[J[0mclearDevData-social.js   [JclearDevData.js          [JclearScraperMetadata.js[J[A[0m[27m[24m[24Ccode clear[Kcode clearScraperMetadata.js[28Dn[27C[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 111 items
 code clearScraperMetadata.js[28Dn[27C[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 111 items
  ScraperJob: 26 items
  ScraperState: 1 items
  ScrapeStructure: 19 items
  ScrapeURL: 1,739 items

  TOTAL: 1,896 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36Gdelete
[INFO] Aborted by user.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 111 items
  ScraperJob: 26 items
  ScraperState: 1 items
  ScrapeStructure: 19 items
  ScrapeURL: 1,739 items

  TOTAL: 1,896 item  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 19 items...
[SUCCESS] ✅ Cleared 19 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1305 items...  Deleted 1739 items...
[SUCCESS] ✅ Cleared 1739 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 1,896 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================

[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hccode clear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K
[J[0mclearDevData-social.js   [JclearDevData.js          [JclearScraperMetadata.js[J[A[0m[27m[24m[24Ccode clear[Kd[?7l[31m…[39m[?7h
[J[A[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clearDevData[K[?1l>[?2004l
]2;code clearDevData]1;code[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoccode clear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clear[K
[J[0mclearDevData-social.js   [JclearDevData.js          [JclearScraperMetadata.js[J[A[0mcode clearDevData.[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m code clearDevData.js[1m [0m[K[0m [?1l>[?2004l
]2;code clearDevData.js]1;code[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hcode clearDevData.js   [17Dn[9CScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttcode clearDevData.js   [17Dn[9CScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 0 items
  ScraperJob: 0 items
  ScraperState: 0 items
  ScrapeStructure: 0 items
  ScrapeURL: 0 items

  TOTAL: 0 items to delete
[INFO] All tables are already empty. Nothing to do.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearScraperMetadata.js[28Dc[9CDevData.js        [8D   [17Dn[9CScraperMetadata.js[28Dc[27C[28Dn[27C[18DDevData           [11D[17Dls               [15Dnode clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5aproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMes-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear uditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-node clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnheed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-stagingeia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all Log-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[17Damplify push --yes[18Dnpm run build     dev  [11Dnode clearDevDataScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 23 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 0 items
  ScrapeURL: 8 items

  TOTAL: 33 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 23 items...
[SUCCESS] ✅ Cleared 23 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapTE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 23 items...
[SUCCESS] ✅ Cleared 23 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging

[SUCCESS] ✅ Cleared 0 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 8 items...
[SUCCESS] ✅ Cleared 8 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 33 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================

[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearScraperMetadata.js[18DDevData           [11D[17Damplify push --yes[18Dnpm run build     dev  [11Dnode clearDevDataScraperMetadata.js[28Dc[9CDevData.js        [8D   [17Dn[9CScraperMetadata.js[28Dc[27C[28Dn[27C[18DDevData           [11D[17Dls               [15Dnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 8 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 3
 /aws/lambda/gameFinancialsProcessor-staging   | 4
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/scraperManagement-staging         | 3
 /aws/lambda/tournamentConsolidator-staging    | 4
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 91 events → log_backup_staging_20251222/_aws_lambda_autoScraper-staging/251222-104214_251222-104618__2025_12_22___LATEST_849de68f9de54bf9a92827ea83f31fc7.json
[SUCCESS] ✅   └─[SUCCESS] ✅   └─ Saved 2572 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-104216_251222-120919__2025_12_22___LATEST_479d0fea50e24743a4f7b4b16b3f9de1.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251222/_aws_lambda_entityVenueDashMetricCounter-staging/251222-104052_251222-104052__2025_12_22___LATEST_639c143daf6146cd9cd3456a3b797b89.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 3506 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-100732_251222-100733__2025_12_22___LATEST_30b8b35787c54e579ddd814c53c8a5eb.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-100733_251222-100733__2025_12_22___LATEST_710718ad7da24b29a0189d06e9a65c03.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-100732_251222-100733__2025_12_22___LATEST_a2a1b3b3fd40443cb297e7412a20eb80.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251222/_aws_lambda_gameFinancialsProcessor-staging/251222-100732_251222-100733__2025_12_22___LATEST_e67c5ee84fed42aca00314bb8fe091c0.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 39 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-111154_251222-111156__2025_12_22___LATEST_6fa5e09d01794af7bfeeaa68ce6ac483.json
[SUCCESS] ✅   └─ Saved 109 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-102754_251222-104138__2025_12_22___LATEST_c72d44de41324fd99db1e55d1662ea29.json
[SUCCESS] ✅   └─ Saved 85 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-102754_251222-104138__2025_12_22___LATEST_c8857ed7aa114e4694e2336b645db2cc.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251222/_aws_lambda_gameIdTracker-staging/251222-111154_251222-111156__2025_12_22___LATEST_e92d0c5e430149b78121f8a8dde4d934.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 220 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 221 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-102752_251222-104215__2025_12_22___LATEST_0f87459cc89a45c68c0d6812cec36fc0.json
[SUCCESS] ✅   └─ Saved 4417 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-102752_251222-111153__2025_12_22___LATEST_6f654068c0d74beabae0fc9408a56ee0.json
[SUCCESS] ✅   └─ Saved 120 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-100326_251222-100757__2025_12_22___LATEST_d25fc91012994d3f90d4cf2050572c8c.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 4758 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournament[SUCCESS] ✅   └─ Saved 4417 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-102752_251222-111153__2025_12_22___LATEST_6f654068c0d74beabae0fc9408a56ee0.json
[SUCCESS] ✅   └─ Saved 120 events → log_backup_staging_20251222/_aws_lambda_scraperManagement-staging/251222-100326_251222-100757__2025_12_22___LATEST_d25fc91012994d3f90d4cf2050572c8c.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 4758 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-100732_251222-100733__2025_12_22___LATEST_0d195fbb566e459695e149ab2296709c.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-100732_251222-100733__2025_12_22___LATEST_a13938126e1a4c2991540694d4b44b73.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-100732_251222-100733__2025_12_22___LATEST_b7173586e0d94a11bdd5aad3a2f0e8bf.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251222/_aws_lambda_tournamentConsolidator-staging/251222-100733_251222-100733__2025_12_22___LATEST_d8a95fa8f0e147ec9679216b421366c5.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 39 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 117 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-100735_251222-100737__2025_12_22___LATEST_106548f4f3b948c085c4c456dca8a5f3.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-100733_251222-100735__2025_12_22___LATEST_4702b100b66147c6a0cc0fe139254af6.json
[SUCCESS] ✅   └─ Saved 60 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-100733_251222-100735__2025_12_22___LATEST_816b1162c2b743b78e46aeb76ebf6c63.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251222/_aws_lambda_venueDetailsUpdater-staging/251222-100733_251222-100735__2025_12_22___LATEST_ce287ad2360b4aa2871dceb9b02641a7.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 403 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 469 events → log_backup_staging_20251222/_aws_lambda_webScraperFunction-staging/251222-104217_251222-104621__2025_b nnode backup[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backup[K
[1;36mbackup_2025-12-22_1023[0m/                   
backupDevData-csv-timestamped.js          
[JbackupThenClearCloudwatchLogs_perStream.js[J[3A[0m[27m[24m[24Cnode backup[Kd[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupDevData-csv-timestamped.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will db nnode backup[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backup[K
[1;36mbackup_2025-12-22_1023[0m/                   
backupDevData-csv-timestamped.js          
[JbackupThenClearCloudwatchLogs_perStream.js[J[3A[0m[27m[24m[24Cnode backup[Kd[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backupDevData-csv-timestamped.js[1m [0m[K[0m [?1l>[?2004l
]2;node backupDevData-csv-timestamped.js]1;node[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eistaging is empty. No backup file created.
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Startistaging is empty. No backup file created.
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-s
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: 
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from Recurring...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 15 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 15 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-stagi...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 15 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 15 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 4 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 4 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/SocialPost-fosb7ek5argnhctgnhctz4odpt52eia-staging → backup_2025-12-23_0645/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing tgnhctz4odpt52eia-staging → backup_2025-12-23_0645/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging istaging...
[SUCCESS] ✅ Saved 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-23_0645
[1m[7m%[27m[1m[0m                                                                     taging...
[SUCCESS] ✅ Saved 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_0645/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-stagicclear[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m clear[1m [0m[K[0m d[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m cleard[K    c  nnode backupDevData-csv-timestamped.js[26DThenClearCloudwatchLogs_perStream.js[42DclearScraperMetadata.js                   [19D[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

--------------------------------backupDevData-csv-timestamped.js[26DThenClearCloudwatchLogs_perStream.js[42DclearScraperMetadata.js                   [19D[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 15 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 4 items
  ScrapeURL: 10 items

  TOTAL: 31 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 15 items...
[SUCCESS] ✅ Cleared 15 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 4 items...
[SUCCESS] ✅ Cleared 4 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 31 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================

[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearScraperMetadata.js[23DbackupDevData-csv-timestamped.js[37Dnpm run dev                          [26D[11Dnode backupThenClearCloudwatchLogs_perStream.js[42DclearScraperMetadata.js                   [19D[18DDevData           [11D[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they wipt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Gamargnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 6 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 6 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 6 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅  table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully [37Dnpm run dev                          [26D[11Dnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 11 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 19
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 4
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/s3ManagementFunction-staging      | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 10
 /aws/lambda/tournamentConsolidator-staging    | 6
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251222-124154_251222-124213__2025_12_22___LATEST_33ffb27de5cf4049bc791f4ccbc3acc9.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 37 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-170205_251222-170205__2025_12_22___LATEST_0a633e5c683a44028fe16e3c2900d41c.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-154149_251222-154149__2025_12_22___LATEST_1e11397cc6724795830be23ca2056aac.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-192348_251222-192348__2025_12_22___LATEST_2522593a124a4e709896f9298a301e4f.json
[SUCCESS] ✅   └─ Saved 4 even[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-170205_251222-170205__2025_12_22___LATEST_0a633e5c683a44028fe16e3c2900d41c.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-154149_251222-154149__2025_12_22___LATEST_1e1139[SUCCESS] ✅   └─ Saved 298 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-153704_251222-155028__2025_12_22___LATEST_48cfe277855a47549fd9ac3b0d43f042.json
[SUCCESS] ✅   └─ Saved 520 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-151522_251222-153750__2025_12_22___LATEST_4ca9f4da94534cc68e5e11df2fd4c212.json
[SUCCESS] ✅   └─ Saved 178 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-201003_251222-201003__2025_12_22___LATEST_582dbca4e5744bcab0c371dfb2b7c4c6.json
[SUCCESS] ✅   └─ Saved 2722 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-131729_251222-151610__2025_12_22___LATEST_592471e223c14fdf8c677f47af8a45f4.json
[SUCCESS] ✅   └─ Saved 2860 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-181116_251222-200018__2025_12_22___LATEST_6a21723867f54cd3bd7223acee62377b.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-183852_251222-183852__2025_12_22___LATEST_867bdb78f0f848fab4fdd6bbb576496d.json
[SUCCESS] ✅   └─ Saved 382 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-160351_251222-161915__2025_12_22___LATEST_8bba2c08087440d58b6072a947b7e164.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-134924_251222-134924__2025_12_22___LATEST_9ce5aa9282a742da8d28e0f4ba98b916.json
[SUCCESS] ✅   └─ Saved 856 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-124932_251222-132305__2025_12_22___LATEST_b38437fa9c5b46138bfa0ee736dd7ca8.json
[SUCCESS] ✅   └─ Saved 27[SUCCESS] ✅   └─ Saved 382 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-160351_251222-161915__2025_12_22___LATEST_8bba2c08087440d58b6072a947b7e164.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-134924_251222-134924__2025_12_22___LATEST_9ce5aa9282a742da8d28e0f4ba98b916.json
[SUCCESS] ✅   └─ Saved 856 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-124932_251222-132305__2025_12_22___LATEST_b38437fa9c5b46138bfa0ee736dd7ca8.json
[SUCCESS] ✅   └─ Saved 2776 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-161240_251222-181552__2025_12_22___LATEST_bb2333692e264e07b80187559c718bb9.json
[SUCCESS] ✅   └─ Saved 304 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-155011_251222-160321__2025_12_22___LATEST_cda9bfaeb5f4497ba3aeda27ddd49744.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-143503_251222-143503__2025_12_22___LATEST_d7026b106d794fe0a26b22b14f154a8b.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-181452_251222-181452__2025_12_22___LATEST_dadc190ac2754df7ab6b8e6a23cb15c0.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-145918_251222-145918__2025_12_22___LATEST_f10c6161ee0349b685f88ef8d7df3105.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 11544 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 137 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251222-124159_251222-124212__2025_12_22___LATEST_8648022dec07463b8428487e02926590.json
[SUCCESS] ✅ Finished /aws/lambCCESS] ✅   └─ Saved 81 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-124204_251222-124213__2025_12_22___LATEST_7c9eae006bc244cbaaaba4eea934a391.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-202152_251222-202153__2025_12_22___LATEST_9a824a93561142cbb6576b00786f6355.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-202152_251222-202153__2025_12_22___LATEST_d3b52ac559e346c885fa53996a4e0061.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-202152_251222-202153__2025_12_22___LATEST_e88635411a064a16859f4fe4f6d0b1e8.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 132 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-140042_251222-140045__2025_12_22___LATEST_1e569cf71f404c22925ccf7a5dbb5e1e.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-140042_251222-140045__2025_12_22___LATEST_22944f8144784a96ad983161649f7c17.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-123502_251222-124114__2025_12_22___LATEST_5bbd814aad794a80932bbb1f71e7a83f.json
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-123502_251222-124214__2025_12_22___LATEST_6bc440a8d616477193f95568946bca5b.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging5ccf7a5dbb5e1e.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-140042_251222-140045__2025_12_22___LATEST_22944f8144784a96ad983161649f7c17.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-123502_251222-124114__2025_12_22___LATEST_5bbd814aad794a80932bbb1f71e7a83f.json
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-123502_251222-124214__2025_12_22___LATEST_6bc440a8d616477193f95568946bca5b.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 103 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/s3ManagementFunction-staging ---
[INFO] Starting backup for: /aws/lambda/s3ManagementFunction-staging
[SUCCESS] ✅   └─ Saved 9 events → log_backup_staging_20251223/_aws_lambda_s3ManagementFunction-staging/251222-130544_251222-130546__2025_12_22___LATEST_23df1c60d12c4be0a8d4dd924ebe52c1.json
[SUCCESS] ✅   └─ Saved 9 events → log_backup_staging_20251223/_aws_lambda_s3ManagementFunction-staging/251222-130544_251222-130546__2025_12_22___LATEST_fae0b7f1db50404da076886078bf634b.json
[SUCCESS] ✅ Finished /aws/lambda/s3ManagementFunction-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/s3ManagementFunction-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251222-124201_251222-124212__2025_12_22___LATEST_2f37bf3dce134b4f9639889ef8899915.json
[SUCC[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-140040_251222-140201__2025_12_22___LATEST_677d07e30201447fa998465bfc44bf54.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-160138_251222-160209__2025_12_22___LATEST_7ecc46ce33f84dc9b52f509df17740f6.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-180414_251222-180417__2025_12_22___LATEST_a6ae1d2cce9c493199fc00ebc58db29b.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-190520_251222-190522__2025_12_22___LATEST_bd77f6bdff5944e5a5562ed157d6ccc1.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-151410_251222-151437__2025_12_22___LATEST_e1e3aeeed869426b99174d03a63c66be.json
[SUCCESS] ✅   └─ Saved 169 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-123500_251222-124114__2025_12_22___LATEST_e36c9592d85347c486c5d498bcc38706.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-140040_251222-140042__2025_12_22___LATEST_e752a795b84d48328bec7fcca4908a84.json
[SUCCESS] ✅   └─ Saved 958 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-194309_251222-195812__2025_12_22___LATEST_ed2dc999cc0c4fbda88ba053ad3034e8.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 1361 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 97 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-124204_251222-124212__2025_12_22___LATEST_50421eff35274130a4ea0ef9a66253dd.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-202152_251222-202153__2025_12_22___LATEST_5122db9c8c91425a8cfda67908bdc93c.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentCocraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 97 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-124204_251222-124212__2025_12_22___LATEST_50421eff35274130a4ea0ef9a66253dd.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-202152_251222-202153__2025_12_22___LATEST_5122db9c8c91425a8cfda67908bdc93c.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-202152_251222-202153__2025_12_22___LATEST_64932519547142c4b9dccce64c30a244.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-124206_251222-124206__2025_12_22___LATEST_972773b20bec4356a6878bb871b5f580.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-124206_251222-124212__2025_12_22___LATEST_b63230c718374b26b5cf2eda1fd42d09.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-202152_251222-202153__2025_12_22___LATEST_dfba6bd91abd4b55a5ed524217f51ed1.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-202152_251222-202153__2025_12_22___LATEST_f7079421cbfc46a19c430136d98ebbf9.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 193 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /5_12_22___LATEST_c3e2501b39b44e5dbd48ceff6b11e578.json
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-202153_251222-202153__2025_12_22___LATEST_d049d7ac80c54b8f90e122c053225b65.json
[SUCCESS] ✅   └─ Saved 205 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-124204_251222-124209__2025_12_22___LATEST_d86cf5b2d00e42129cac39af151a1f9c.json
[SUCCESS] ✅   └─ Saved 93 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-202152_251222-202155__2025_12_22___LATEST_dbbc1aacddcc47aab364a015b9b0c387.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 903 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScrape[SUCCESS] ✅   └─ Saved 205 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-124204_251222-124209__2025_12_22___LATEST_d86cf5b2d00e42129cac39af151a1f9c.json
[SUCCESS] ✅   └─ Saved 93 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-202152_251222-202155__2025_12_22___LATEST_dbbc1aacddcc47aab364a015b9b0c387.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 903 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 305 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251222-124157_251222-124752__2025_node backupThenClearCloudwatchLogs_perStream.js[42DclearDevData                              [30DScraperMetadata.js[23DbackupDevData-csv-timestamped.js[32DclearScraperMetadata.js         [9D[18DDevData           [11D[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from GameCost-fosb7ek5argnhctz4odpt52eia-stagi
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted allhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 10 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 10 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Preia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 10 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 10 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Tournamenode clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 14 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 14 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 14 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 14 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnaps[INFO] Deleted 14 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 14 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 14 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 14 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketin Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 4 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staek5arg[INFO] Deleted 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 15 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[17Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K
[K[A[50C[A[A[26Damplify push --yes[K[1B[K[1B[K[1B[K[3A[42C[18Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify status[K[1B[K[1B[K[1B[K[3A[38C[14Dnpm run dev   build[13Damplify push --yes[18Dnpm run build     dev  [11Damplify status[14Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify push --yes[K[1B[K[1B[K[1B[K[3A[42C[18Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Dnode clearDevData[K[1B[K[1B[K[1B[K[3A[41C[17D                 [17Dnode clearDevData[17Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify push --yes[K[1B[K[1B[K[1B[K[3A[42C[18Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify status[K[1B[K[1B[K[1B[K[3A[38C[14Dnpm run dev   build[13Damplify push --yes[10Dstatus    [14Dnpm run build [13Dnode clearDevData[17Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify push --yes[K[1B[K[1B[K[1B[K[3A[42C[18Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify status[K[1B[K[1B[K[1B[K[3A[38C[14Dnpm run dev   build[13Damplify push --yes[10Dstatus    [14Dnpm run build [13Dnode clearDevData[17Dnpm run build    dev  [11Damplify push --yes[18Dnode backupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l[1B]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWA /aws/lambda/refreshAllMetrics-staging         | 2
 /aws/lambda/saveGameFunction-staging          | 2
 /aws/lambda/scraperManagement-staging         | 6
 /aws/lambda/tournamentConsolidator-staging    | 15
 /aws/lambda/venueDetailsUpdater-staging       | 12
 /aws/lambda/webScraperFunction-staging        | 2
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 34 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251222-233615_251222-233637__2025_12_22___LATEST_4481c89cd26642e4aaabc1c6b53fa677.json
[SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251222-203208_251222-203228__2025_12_22___LATEST_a40b4bd8e62a41ea8f7a1c03f1770ce6.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 69 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 496 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-202341_251222-204451__2025_12_22___LATEST_0e7e867f3aa747d5[SUCCESS] ✅   └─ [SUCCESS] ✅   └─ Saved 1756 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-224638_251222-234258__2025_12_22___LATEST_156ba86c49f84e81b99e68926c602218.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-235055_251222-235056__2025_12_22___LATEST_24895a10b924420d8d2aef9d9cdf9d7f.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-223038_251222-223038__2025_12_22___LATEST_4a893b8ac52e498f9eeb2f5dc8e1552d.json
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-202250_251222-202325__2025_12_22___LATEST_582dbca4e5744bcab0c371dfb2b7c4c6.json
[SUCCESS] ✅   └─ Saved 30 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-202350_251222-202436__2025_12_22___LATEST_6a21723867f54cd3bd7223acee62377b.json
[SUCCESS] ✅   └─ Saved 2932 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-203447_251222-224736__2025_12_22___LATEST_9250dcf63d4b4716a09e47234d890acd.json
[SUCCESS] ✅   └─ Saved 4[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-202250_251222-202325__2025_12_22___LATEST_582dbca4e5744bcab0c371dfb2b7c4c6.json
[SUCCESS] ✅   └─ Saved 30 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-202350_251222-202436__2025_12_22___LATEST_6a21723867f54cd3bd7223acee62377b.json
[SUCCESS] ✅   └─ Saved 2932 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251222-203447_25[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 194 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251222-203213_251222-203228__2025_12_22___LATEST_6b8c751053ce4ac6a867db60e4e86d97.json
[SUCCESS] ✅   └─ Saved 238 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251222-233620_251222-233636__2025_12_22___LATEST_a88afbf652b74a109d1c44879a5c7755.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 432 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-233629_251222-233633__2025_12_22___LATEST_3502ee35a29440ed89507fe144dedd9d.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-230907_251222-230907__2025_12_22___LATEST_57dc213dec294c82b155a781baaec717.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-203229_251222-203232__2025_12_22___LATEST_6cca99e575c54ddf8a21f9b54b501418.json
[SUCCESS] ✅   └─ Saved 16 events → log_[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-233629_251222-233633__2025_12_22___LATEST_3502ee35a29440ed89507fe144dedd9d.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-230907_251222-230907__2025_12_22___LATEST_57dc213dec294c82b155a781baaec717.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-203229_251222-203232__2025_12_22___LATEST_6cca99e575c54ddf8a21f9b54b501418.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-230906_251222-230907__2025_12_22___LATEST_7a1fc2069a3341d8aec82d4c9dfc2ec1.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-230907_251222-230907__2025_12_22_[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-235806_251222-235807__2025_12_22___LATEST_cfa8d8bb0fbd421bb1c4acbe9df55dda.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-230906_251222-230907__2025_12_22___LATEST_ded1e67a8ba74dd8b5d7793982d50aa9.json
[SUCCESS] ✅   └─ Saved 64 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-203218_251222-203229__2025_12_22___LATEST_e88635411a064a16859f4fe4f6d0b1e8.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-235806_251222-235807__2025_12_22___LATEST_ea8893e2a25140989da290c79d466136.json
[SUCCESS] ✅   └─ Saved 129 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-233631_251222-233645__2025_12_22___LATEST_edde961cbcb6497db832a495257ee6a3.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 482 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambd[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-235806_251222-235807__2025_12_22___LATEST_ea8893e2a25140989da290c79d466136.json
[SUCCESS] ✅   └─ Saved 129 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251222-233631_251222-233645__2025_12_22___LATEST_edde961cbcb6497db832a495257ee6a3.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 482 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-203036_251222-203230__2025_12_22___LATEST_04a26d4741874c1ea0cbe9d41610c32d.json
[SUCCESS] ✅   └─ Saved 28 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-2334[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-230640_251222-230642__2025_12_22___LATEST_93a63fc425284520b6df4d455555e7d1.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-233405_251222-233408__2025_12_22___LATEST_aa6bdc52dad34bfb970b2ea7e8d7e74d.json
[SUCCESS] ✅   └─ Saved 88 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251222-233406_251222-233641__2025_12_22___LATEST_afc2498ed31a45f0888425f979dce140.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 248 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251223/_aws_lambda_refreshAllMetrics-staging/251222-234459_251222-234509__2025_12_22___LATEST_7421e8e5621a4b68ae1e97b30d5dd36b.json
[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251223/_aws_lambda_refreshAllMetrics-staging/251222-222549_251222-222559__2025_12_22___LATEST_ecf5715d09644a66aa19e354716fb08e.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 28 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 46 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251222-233623_251222-233636__2025_12_22___LATEST_aae8e62873b34ddf864d0b593bbb5fdf.js[SUCCESS] ✅   └─ Saved 14 events → log_backup_staging_20251223/_aws_lambda_refreshAllMetrics-staging/251222-222549_251222-222559__2025_12_22___LATEST_ecf5715d09644a66aa19e354716fb08e.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 28 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 46 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251222-233623_251222-233636__2025_12_22___LATEST_aae8e62873b34ddf864d0b593bbb5fdf.json
[SUCCESS] ✅   └─ Saved 36 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251222-203216_251222-203228__2025_12_22___LATEST_cd2d0b80e20744f6b21512cc723706d1.json
[SUC[SUCCESS] ✅   └─ Saved 277 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-230637_251222-231737__2025_12_22___LATEST_10ce07c7f4a247eb86583589b00b8369.json
[SUCCESS] ✅   └─ Saved 683 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-231639_251222-234433__2025_12_22___LATEST_2261971c98c54df6afdb162254d27b62.json
[SUCCESS] ✅   └─ Saved 65 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-203035_251222-203209__2025_12_22___LATEST_3d18c6a9d9ec4c608de2fddcaa90c0ad.json
[SUCCESS] ✅   └─ Saved 264 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251222-202312_251222-203229__2025_12_22___LATEST_ed2dc999cc0c4fbda88ba053ad3034e8.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 1303 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-203230_251222-203232__2025_12_22___LATEST_0c5b9124af08462f93b308e489f639be.json
[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-233631_251222-233638__2025_12_22___LATEST_10fb931de463415aa21f148d413c1a66.json
[SUCCESS] ✅   └─ Saved 16 events → log_[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-203230_251222-203232__2025_12_22___LATEST_0c5b9124af08462f93b308e489f639be.json
[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-233631_251222-233638__2025_12_22___LATEST_10fb931de463415aa21f148d413c1a66.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-230906_251222-230907__2025_12_22[SUCCESS] ✅   └─ Saved 38 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-233633_251222-233638__2025_12_22___LATEST_99303c0b5c014747a33364360191ce7c.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-230906_251222-230907__2025_12_22___LATEST_996cc124a53c410088c2c6cc1679ba17.json
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-235806_251222-235807__2025_12_22___LATEST_b518e8cb561c441a8f3d2a73da030bbf.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-230906_251222-230907__2025_12_22___LATEST_bff9b6ff454047dea4103eddf44e6581.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-235806_251222-235807__2025_12_22___LATEST_c7be7195b08146a192ec981395a7e027.json
[SUCCESS] ✅   └─ Saved 65 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-203218_251222-203230__2025_12_22___LATEST_f7079421cbfc46a19c430136d98ebbf9.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-230906_251222-230907__2025_12_22___LATEST_fa1e9485319644de811a54d5853b83b2.json
[SUCCESS] ✅   └─ Saved 111 events → log_bac[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-235806_251222-235807__2025_12_22___LATEST_c7be7195b08146a192ec981395a7e027.json
[SUCCESS] ✅   └─ Saved 65 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-203218_251222-203230__2025_12_22___LATEST_f7079421cbfc46a19c430136d98ebbf9.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-230906_251222-230907__2025_12_22___LATEST_fa1e9485319644de811a54d5853b83b2.json
[SUCCESS] ✅   └─ Saved 111 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-233633_251222-233639__2025_12_22___LATEST_fef2e245466e43bf807f1d489528a028.json
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251222-235806_251222-235807__2025_12_22___LATEST_ffb1e3e01e3a48e796deddffaa23d2b9.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 704 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Star[SUCCESS] ✅   └─ Saved 161 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-235806_251222-235809__2025_12_22___LATEST_3fe6da4a0f824e3b83ccde1e2fee97f2.json
[SUCCESS] ✅   └─ Saved 118 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-230907_251222-230910__2025_12_22___LATEST_401313d6c6304226bbdf01ca05c956b7.json
[SUCCESS] ✅   └─ Saved 523 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-233631_251222-233638__2025_12_22___LATEST_6081bec4c6ca45df8bdfebc51982de1a.json
[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-235806_251222-235809__2025_12_22___LATEST_68b6439170f34f509384992463ac9e0d.json
[SUCCESS] ✅   └─ Saved 1082 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-233625_251222-233639__2025_12_22___LATEST_69f276c81410486c80dbbd08ccec97b4.json
[SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-230907_251222-230909__2025_12_22___LATEST_6b4d2137f427418696de1c97f19c3ea4.json
[SUCCESS] ✅   └─ Saved 151 events → log_backup_s[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-235806_251222-235809__2025_12_22___LATEST_68b6439170f34f509384992463ac9e0d.json
[SUCCESS] ✅   └─ Saved 1082 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-233625_251222-233639__20[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251222-230907_251222-230909__2025_12_22___LATEST_d7d4cb2f36944f509f7573d016a2c2b5.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 3286 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 290 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251222-233618_251222-233636__2025_12_22___LATEST_3810999be3964d3ab6fbf6840f0ecfbd.json
[SUCCESS] ✅   └─ Saved 301 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251222-203211_251222-203850__2025_12_22___LATEST_86729238f5a9430b89f870cf40dd6de0.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 591 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode backupThenClearCloudwatchLogs_perStream.js[42DclearDevData                              [30D[17Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K
[K[A[50C[A[A[26Damplify push --yes[K[1B[K[1B[K[1B[K[3A[42C[18Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K[1B[K[A[50C[A[A[26Damplify status[K[1B[K[1B[K[1B[K[3A[38C[14Dnpm run dev node backupThenClearCloudwatchLogs_perStream.js[42DclearDevData                              [30D[17Daws lambda get-function --function-name refreshAllMetrics-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda.zip && unzip -p /tmp/lambda.zip index.js | head -50[K
[K[A[50C[A[A[26Damplif[32DclearScraperMetadata.js         [9D[?1l>[?2004l[1B]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 36 items
  ScraperJob: 2 items
  ScraperState: 1 items
  ScrapeStructure: 7 items
  ScrapeURL: 20 items

  TOTAL: 66 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 36 items...
[SUCCESS] ✅ Cleared 36 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: SDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 36 items...
[SUCCESS] ✅ Cleared 36 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 7 items...
[SUCCESS] ✅ Cleared 7 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 20 items...
[SUCCESS] ✅ Cleared 20 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

=========node clearScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 0 items
  ScraperJob: node clearScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 0 items
  ScraperJob: 0 items
  ScraperState: 0 items
  ScrapeStructu[11Damplify status[14Dnode clearScraperMetadata.js[23DbackupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 3 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/scraperManagement-staging         | 4
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] [INFO] Found 3 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/scraperManagement-staging         | 4
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCou[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-013316_251223-013318__2025_12_23___LATEST_45873051909a46ba80d6d6604734bebe.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-011748_251223-011807__2025_12_23___LATEST_610ad8e8b4504f70ac36935182008dfd.json
[SUCCESS] ✅   └─ Saved 37 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-004940_251223-004943__2025_12_23___LATEST_9a137736c5e24320acf74a2efd8935d9.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-004940_251223-004942__2025_12_23___LATEST_b53e90142fc6488b90624c9e8232a9d2.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 100 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-004936_251223-004943__2025_12_23___LATEST_0cc5cfd522aa40fe8712fbe6ebf24995.json
[SUC[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-004940_251223-004942__2025_12_23___LATEST_b53e90142fc6488b90624c9e8232a9d2.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 100 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-004936_251223-004943__2025_12_23___LATEST_0cc5cfd522aa40fe8712fbe6ebf24995.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-013316_251223-013318__2025_12_23___LATEST_9cdf26772c03470b80609d06293c6138.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-004936_251223-004938__2025_12_23___LATEST_9fc103a83b014e7d885577a02b12c468.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-011747_251223-011807__2025_12_23___LATEST_dd6f6fffc6c041d4bef7490482836f80.json
[SUCCESS] ✅ Finished /aws/lambda/scraper[28Damplify push --yes          [10D[18Dnpm run build     dev  [11Damplify status[14Dnode clearScraperMetadata.js[23DbackupThenClearCloudwatchLogs_perStream.js[42DclearDevData                              [30D[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
ayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 3 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 3 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-sta✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clea[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-node clearDevData[?1l>[?2004l
]2;node clearDevData]1;node[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odp[INFO] Deleted 24 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 24 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 24 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 24 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-stag[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data fromek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnode clearDevData[17Damplify push --yes[18Dnpm run dev       [11Dnode clearDevData[12DbackupThenClearCloudwatchLogs_perStream.js[?1l>[?2004l
]2;node backupThenClearCloudwatchLogs_perStream.js]1;node[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 4
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 8
 /aws/lambda/gameIdTracker-staging             | 3
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 9
 /aws/lambda/venueDetailsUpdater-staging       | 8
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] � /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 8
 /aws/lambda/gameIdTracker-staging             | 3
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 9
 /aws/lambda/venueDetailsUpdater-staging       | 8
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCE[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-023207_251223-023207__2025_12_23___LATEST_44f0e1b8c8d34f108260228d006a1ffd.json
[SUCCESS] ✅   └─ Saved 1948 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-015009_251223-024731__2025_12_23___LATEST_46634ff38dab433d84d914b171bc540a.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-025431_251223-025431__2025_12_23___LATEST_d008ae56cc27479c8170e5d4a32e2994.json
[SUCCESS] ✅   └─ Saved 336 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-013759_251223-015201__2025_12_23___LATEST_ecf8495666364eb5b16d057055b938ad.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 2292 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 1394 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251223-015513_251223-015921__2025_12_23___LATE[SUCCESS] ✅   └─ Saved 336 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-013759_251223-015201__2025_12_23___LATEST_ecf8495666364eb5b16d057055b938ad.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 2292 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 1394 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251223-015513_251223-015921__2025_12_23___LATEST_73c0842455d1470faf48550d0f015404.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 1394 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-031129_251223-031130__2025_12_23__[SUCCESS] ✅   └─ Saved 46 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-031129_251223-031129__2025_12_23___LATEST_aeb6a74b933640ae835f3a58e739ffaa.json
[SUCCESS] ✅   └─ Saved 217 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-015519_251223-015650__2025_12_23___LATEST_df9c77cdc00b4e4f89e063e22c8fbd4a.json
[SUCCESS] ✅   └─ Saved 65 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-015517_251223-015651__2025_12_23___LATEST_f6efe3ed13014f9d9ec9927cadfcdc0d.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-031130_251223-031130__2025_12_23___LATEST_fca816cefd714f05aef997cd6fc455cf.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 440 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-015530_251223-015532__2025_12_23___LATEST_09ebe57c6f1d4e70a97a6c062e[SUCCESS] ✅[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-015531_251223-015533__2025_12_23___LATEST_62fc0e37c02440c489924b96c927e05e.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-015451_251223-015453__2025_12_23___LATEST_f4cd6c58279a474eb46ff598b6dbe0c4.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 45 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 266 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251223-015515_251223-015921__2025_12_23___LATEST_02500ef5323d47b0916c04e23233d76e.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 266 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-015449_251223-015450__2025_12_23___LATEST_69c41b71cef84963837b2963923cbaba.json
[SUCCESS] ✅   └─ Saved 131 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-015449_251223-015531__2025_12_23___LATEST_aac265e997ce43f7a3f79c6a696e5993.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 138 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentCons[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-015449_251223-015450__2025_12_23___LATEST_69c41b71cef84963837b2963923cbaba.json
[SUCCESS] ✅   └─ Saved 131 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-015449_251223-015531__2025_12_23___LATEST_aac265e997ce43f7a3f79c6a696e5993.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 138 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-015524_251223-015524__2025_12_23[SUCCESS] ✅   └─ Saved 81 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-015517_251223-015650__2025_12_23___LATEST_baed84c2999a4ab4bd5487f15777bc30.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-031129_251223-031129__2025_12_23___LATEST_cb38a34801894b7c91c124469dcab7a7.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-031130_251223-031130__2025_12_23___LATEST_d03e4fc004a64a618afe5d2413a2500a.json
[SUCCESS] ✅   └─ Saved 237 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-015519_251223-015651__2025_12_23___LATEST_e64042cba3964648a56a83eaa2abf6cf.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-031129_251223-031130__2025_12_23___LATEST_f891147fcf2e448e88e5e618c94b0aaf.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 581 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 441 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031129_251223-031135__2025_12_23___LATEST_096fcf1fdaef4e94a2db245f4d0e1770.json
[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031130_251223-031132__2025_12_23___LATEST_19910a33ed0[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 581 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 441 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031129_251223-031135__2025_12_23___LATEST_096fcf1fdaef4e94a2db245f4d0e1770.json
[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031130_251223-031132__2025_12_23___LATEST_19910a33ed0c4aeab8bd3f14ac7d3c70.json
[SUCCESS] ✅   └─ Saved 1493 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-015517_251223-015651__202[SUCCESS] ✅   └─ Saved 219 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031129_251223-031132__2025_12_23___LATEST_d12fcd277df64355b85ae21113dddc36.json
[SUCCESS] ✅   └─ Saved 267 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-031131_251223-031133__2025_12_23___LATEST_fe687b27f8684faaa92be383c7a00fba.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 3293 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 1687 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251223-015509_251223-015921__2025_12_23___LATEST_968d4944fcc94ee0963c557acff93ebf.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 1687 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/ho[SUCCESS] ✅   └─ Saved 1687 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251223-015509_251223-015921__2025_1node backupThenClearCloudwatchLogs_perStream.js[42DclearDevData                              [30D[17Damplify push --yes[18Dnpm run dev       [11Dnode clearDevData[12DbackupThenClearCloudwatchLogs_perStream.js[42DclearScraperMetadata.js                   [19D[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 120 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 13 items
  ScrapeURL: 30 items

  TOTAL: 165 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 120 items...
[SUCCESS] ✅ Cleared 120 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table:DELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 120 items...
[SUCCESS] ✅ Cleared 120 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 13 items...
[SUCCESS] ✅ Cleared 13 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 30 items...
[SUCCESS] ✅ Cleared 30 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

==========node clearScraperMetadata.js[?1l>[?2004l
]2;node clearScraperMetadata.js]1;node
============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 0 items
  ScraperJob: 1 items
  ScraperState: 0 items
  ScrapeStructure: 0 items
  ScrapeURL: 0 items

  TOTAL: 1 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE[1A[1G[0J
Type "DELETE" to confirm deletion: DELET[41G[1A[1G[0J
Type "DELETE" to confirm deletion: DELE[40G[1A[1G[0J
Type "DELETE" to confirm deletion: DEL[39G[1A[1G[0J
Type "DELETE" to confirm deletion: DE[38G[1A[1G[0J
Type "DELETE" to confirm deletion: D[37G[1A[1G[0J
Type "DELETE" to confirm deletion: [36G[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsrooDELETE[1A[1G[0J
Type "DELETE" to confirm deletion: DELET[41G[1A[1G[0J
Type "DELETE" to confirm deletion: DELE[4ccoed  de run_cleanup_sequence.sh[?1l>[?2004l
]2;code run_cleanup_sequence.sh]1;code[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h[7mchmod +x run_cleanup_sequence.sh[27m[32D[27mc[27mh[27mm[27mo[27md[27m [27m+[27mx[27m [27mr[27mu[27mn[27m_[27mc[27ml[27me[27ma[2p_sequence.sh[?1l>[?2004l
]2;code run_cleanup_sequence.sh]1;code[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h[7mchmod +x run_cleanup_sequence.sh[27m[32D[27mc[27mh[27mm[27mo[27md[2[7m./run_cleanup_sequence.sh --auto[27m[32D[27m.[27m/[27mr[27mu[27mn[27m_[27mc[27ml[27me[27ma[27mn[27mu[27mp[27m_[27ms[27me[27mq[27mu[27me[27mn[27mc[27me[27m.[27ms[27mh[27m [27m-[27m-[27ma[27mu[27mt[27mo[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

========================================================[7m./run_cleanup_sequence.sh --auto[27m[32D[27m.[27m/[27mr[27mu[27mn[27m_[27mc[27ml[27me[27ma[27mn[27mu[27mp[27m_[27ms[27me[27mq[27mu[27me[27mn[27mc[27me[27m.[27ms[27mh[27m [27m-[27m-[27ma[27mu[27mt[27mo[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eitable: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 16 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 16 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Startingtable: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 16 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 16 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odptable: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-stagin[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odp[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4oing...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 17 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 17 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Srting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-23_1527

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE[INFO] Scanned 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1527/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-23_1527

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fo to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Stag table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 17 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 17 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5ar[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 185 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 2 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 20 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-[INFO] Found 11 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 2
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 5
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/refreshAllMetrics-staging         | 1
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251223-035023_251223-035038__2025_12_23___LATEST_4217f6103d7449e390f2b3a6306f8dde.json
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251223/_aws_lambd /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251223-035023_251223-035038__2025_12_23___LATEST_4217f6103d7449e390f2b3a6306f8dde.json
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251223-032158_251223-032507__2025_12_23___LATEST_a00569f42eae4533a41154e153e1fd9d.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 39 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1560 events → log_backu[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251223-035027_251223-035038__2025_12_23___LATEST_006cb4f7bb1a4e938b5f5c4baff4de66.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 151 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-035032_251223-035035__2025_12_23___LATEST_3d5e8e58970b417e94b513056307ee89.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_4d9a0f761c4f4d3da6d20e9fd94b2abd.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_64f2dffe56b740378c8be00954fc265a.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_cc2b3b97c24f481cb6b1935e1f616b89.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_ee435669a4f44367bcd702300156049d.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 70 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/ga[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_cc2b3b97c24f481cb6b1935e1f616b89.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-042814_251223-042814__2025_12_23___LATEST_ee435669a4f44367bcd702300156049d.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 70 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-0348[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 139 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251223/_aws_lambda_refreshAllMetrics-staging/251223-035057_251223-035103__2025_12_23___LATEST_cc7bbc08b5044130ad91e58b6534833d.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 17 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251223-035029_251223-035037__2025_12_23___LATEST_5fa7b1c86b3c4cd38127dafa053c0009.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 47 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-032136_251223-032201__2025_12_23___LATEST_496ddd3cfb2742439db751a99dde76dd.js[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251223-035029_251223-035037__2025_12_23___LATEST_5fa7b1c86b3c4cd38127dafa053c0009.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 47 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-032136_251223-032201__2025_12_23___LATEST_496ddd3cfb2742439db751a99dde76dd.json
[SUCCESS] ✅   └─ Saved 4325 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-032136_251223-035041__2025_12_23___LATEST_ffd347041a344f3c840a000890c0ed03.json
[SUCCESS] ✅ Finished /aws/[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-042814_251223-042814__2025_12_23___LATEST_c5f20c397b5c4cafbbec7db5cbe38e27.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-042814_251223-042814__2025_12_23___LATEST_c63f09d9d581454683b18768d5ece0d7.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-042814_251223-042814__2025_12_23___LATEST_e8702745a3464f92b6da7667db77b2a0.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 60 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042814_251223-042816__2025_12_23___LATEST_2ac0f24e3cc34a3fafc5ebd2a3c93897.json
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042814_251223-042816__2025_12_23___LATEST_5f6b306cc215402ea5b2f9e6deef403b.json
[SUCCESS] ✅   └─ Saved 181 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-035033_25122[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042814_251223-042816__2025_12_23___LATEST_2ac0f24e3cc34a3fafc5ebd2a3c93897.json
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042814_251223-042816__2025_12_23___LATEST_5f6b306cc215402ea5b2f9e6deef403b.json
[SUCCESS] ✅   └─ Saved 181 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-035033_251223-035038__2025_12_23___LATEST_61cca9af9b2a4585a898eacffd63b9e3.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-035032_251223-035035__2025_12_23___LATEST_95429a60b6a241e99ff8b8b6ffe098b4.json
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042815_251223-042815__2025_12_23___LATEST_a0846bcb22134a74b5ff747856e0ea7e.json
[SUCCESS] ✅   └─ Saved 117 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-042814_251223-042816__2025_12_23___LATEST_d4cb3a303d274a2bb1894e7f792f
======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004haamplify      a  ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreferencarting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPPlayer-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-stagin[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_20tems from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] �ms from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreferenenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_1954/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-23_1954

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4og.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 7 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 7 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully delete: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-stagifosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 8
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_autoScraprocessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 4
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/venueDetailsUpdater-staging       | 4
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251223-075241_251223-075256__2025_12_23___LATEST_f3231ec74c914b108a5bc09046dacaf7.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 364 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-043347_251223-043500__2025_12_23___LATEST_36127006b3084679a5e6d484173b0792.json
[SUCCESS] ✅   └─ Saved 301 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-043258_251223-043433__2025_12_23___LATEST_36e0eacbfd0948069f3a4c8dcf57fb36.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-085446_251223-085448__2025_12_23___LATEST_3f73feb544ff42669ff5b81885cee8e3.json
[SUCCESS] ✅   └─ Saved 436 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-043314_251223-043500__2025_12_23___LATEST_42f7db488bd744e0bb41b466f111c8bb.json
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-075250_251223-075256__2025_12_23___LATEST_49f349bc4bf947f9b284f0a988329f07.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-044447_251223-044447__2025_12_23___LATEST_7e96f0e17f6048a2ad98bd46d8363855.json
[SUCCESS] ✅   └─ Saved 4 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-042940_251223-042940__2025_12_23___LATEST_9a2c4c0e303a4de489bf589dd3e86ab3.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-043347_251223-043347__2025_12_23___LATEST_c69afdd0dee3428eae7d806b8a5de49f.json
[SUCCESS] ✅   └─ Saved 210 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-042940_251223-043249__2025_12_23___LATEST_d47b47d365e84ec4a5971290a603778b.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-085448_251223-085448__2025_12_23___LATEST_f3e398835da84c25985baebda8061474.json
[SUCCESS] ✅ Finished /aws/lambda/enti[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-085446_251223-085446__2025_12_23___LATEST_3ea942b1d26c41a79e31ada8cc8f382e.json
[SUCCESS] ✅   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-075250_251223-075256__2025_12_23___LATEST_84f4e5adac8248aab22cbdaf816d3435.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-085446_251223-085446__2025_12_23___LATEST_b4e02aa1e8064996a487d00840ad1a10.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-085446_251223-085446__2025_12_23___LATEST_ff859cd1f77842968d06197336ee2a43.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-��   └─ Saved 41 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-075250_251223-075256__2025_12_23___LATEST_84f4e5adac8248aab22cbdaf816d3435.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-085446_251223-085446__2025_12_23___LATEST_b4e02aa1e8064996a487d00840ad1a10.json
[SUCCESS] ✅   └─ Saved 11 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsProcessor-staging/251223-085446_251223-085446__2025_12_23___LATEST_ff859cd1f77842968d06197336ee2a43.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 69 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-075139_251223-075258__2025_12_23___LATEST_717b3b0d43fa4853b39c3730fcf273ad.json
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-075139_251223-075144__2025_12_23___LATEST_e4e8949e835f4d6d9b0d26fcae08fb40.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 65 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251223-075248_251223-075256__2025_12_23___LATEST_21803a13aadd4da9b9a519c92c319d95.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-085336_251223-085338__2025_12_23___LATEST_486a55c5756141c3831a1c154e98f310.json
[SUCCESS] ✅   └─ Saved 35 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-075137_251223-075241__2025_12_23___LATEST_65ef3ed089f647d88698c27ccd88d772.json
[SUCCESS] ✅   └─ Saved 7 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-085337_251223-085339__2025_12_23___LATEST_732771c26aff47cdb1d1cb0013fd469f.json
[SUCCESS] ✅   └─ Saved 79 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-075137_251223-075258__2025_12_23___LATEST_c9c5479f7dc2408685b9a75866856603.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 152 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 31 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-stEST_d9189f14971c4bcd9ddcc02ea2625dca.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 233 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-075250_251223-075256__2025_12_23___LATEST_2f071cdc927e40dc863b632f5e3482da.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-085447_251223-085448__2025_12_23___LATEST_4a2b1677dcc7[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 233 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-075250_251223-075256__2025_12_23___LATEST_2f071cdc927e40dc863b632f5e3482da.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-085447_251223-085448__2025_12_23___LATEST_4a2b1677dcc7439da7f0dbb196df5288.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-085446_251223-085448__2025_12_23___LATEST_6196d4f9d10d49acbc1bd921ca3fb0a5.json
[SUCCESS] ✅   └─ Saved 59 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-085447_251223-085449__2025_12_23___LATEST_76bb7287d9b244a8ba5cd0c47cfa74f0.json
[SUCCESS] ✅   └─ Saved 61 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-075252_251223-075253__2025_12_23___LATEST_ff8d62a6cf10460ea3dd7a2132b907de.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 579 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 148 events → log_backup_staging_20251223/_aws_lambda_webScraperFunction-staging/251223-075243_251223-075255__2025_12_23___LATEST_cca878ef3f5c4a0ea4dab1cfab1bab5c.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 148 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESnnode back[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node back[K
[0mbackfill-entity-venue-counters.js         
backfill-parent-records.js                
backfill-recurring-game-sync-fields.cjs   
backupDevData-csv-timestamped.js          
[JbackupThenClearCloudwatchLogs_perStream.js[J[5A[0m[27m[24m[24Cnode back[Ku[?7l[31m…[39m[?7h
[J[A[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node backup[Kd[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m�nnode back[?7l[31m…[39m[?7h[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m node back[K
[0mbackfill-entity-venue-counters.js       [INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreference-fosb7ek5argnhctz4odpt52eia-staging
- Venue-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "backup" to continue: [28Gbackup
[INFO] Saving backups to directory: ./backup_2025-12-23_2221
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 4 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 4 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-sbackup
[INFO] Saving backups to directory: ./backup_2025-12-23_2221
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 4 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 4 items from AmplifyDat
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5ot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: MarketingMessage-foing
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/RecurringGameMetrics-fosScanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Recurrinaved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 16 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 16 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2221/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 193 items from VenueMetrics-fosb7ek5argnhctnode backupDevData-csv-timestamped.js[37Dnpm run dev                          [26D[11Damplify push --yes[10Dstatus    [14Dnpm run build [13Damplify push --yes[18Dgit add .         
git commit -m "Split game metrics (All metrics) by gameType, other fixes and enhancements."[K
git push[K[3A[25C[9Dnpm run build[1B[K[1B[K[1B[K[3A[37Cdev  builddev  [11Dno[9C[11Dnp[6Cbuild[13Damplify push --yes[10Dstatus    [14D./run_cleanup_sequence.sh --auto[?1l>[?2004l[1B]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreference-fosb7ek5argnhctz4odpt52eia-staging
- Venue-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "backup" to continue: [28Gbackup
[INFO] Saving backups to directory: ./backup_2025-12-23_2257
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 4 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 4 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up a[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to backz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctzng.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[I[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing tablecreated.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_2025-12-23_2257/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_2025-12-23_2257

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from saction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCos52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eiodpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 16 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 16 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-s all 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-sttate: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
 =================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 11 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/refreshAllMetrics-staging         | 1
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 2
 /aws/lambda/venueDetailsUpdater-staging       | 1
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → log_backup_staging_20251223/_aws_lambda_autoScraper-staging/251223-090323_251223-090339__2025_12_23___LATEST_0c8830f8302b4cc38aa5d5d3aa8b9a8f.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 30 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-090333_251223-090339__2025_12_23___LATEST_5076b04863e041528593a3c440de488c.json
[SUCCESS] ✅   └─ Saved 1 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-115751_251223-115751__2025_12_23___LATEST_8f078c3c11ca4137a86eeb5f7f619440.json
[SUCCESS] ✅   └─ Saved 13 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-115749_251223-115751__2025_12_23___LATEST_cd2e1acee57a49a7a2a900769e4f06b1.json
[SUCCESS] ✅   └─ Saved 3 events → log_backup_staging_20251223/_aws_lambda_entityVenueDashMetricCounter-staging/251223-115750_251223-115750__2025_12_23___LATEST_e2d01a65e9d646d1942f19870b10940f.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 47 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251223-090328_251223-090339__2025_12_23___LATEST_767169b082fc491fa8ee62f9d1a4a903.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 151 events.
[SUCCESS] ✅ Deleted log group: /aws/lambd2_23___LATEST_e2d01a65e9d646d1942f19870b10940f.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 47 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 151 events → log_backup_staging_20251223/_aws_lambda_gameDataEnricher-staging/251223-090328_251223-090339__2025_12_23___LATEST_767169b082fc491fa8ee62f9d1a4a903.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 151 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_gameFinancialsPro-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 25 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-090228_251223-090312__2025_12_23___LATEST_f1f361fadf0d4ce4bb7c705d3e6ed2ed.json
[SUCCESS] ✅   └─ Saved 40 events → log_backup_staging_20251223/_aws_lambda_gameIdTracker-staging/251223-090228_251223-090341__2025_12_23___LATEST_fc44fddceb4c4ff09c07768b3139af88.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 65 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 17 events → log_backup_staging_20251223/_aws_lambda_refreshAllMetrics-staging/251223-090858_251223-090911__2025_12_23___LATEST_9f399cd95e0748309a0fb58e6c09b848.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 17 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → log_backup_staging_20251223/_aws_lambda_saveGameFunction-staging/251223-090331_251223-090339__2025_12_23___LATEST_48b7ce35dbf34314a5a2d9ab7a758650.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 18 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-090227_251223-090312__2025_12_23___LATEST_486a55c5756141c3831a1c154e98f310.json
[SUCCESS] ✅   └─ Saved 107 events → log_backup_staging_20251223/_aws_lambda_scraperManagement-staging/251223-090227_251223-090340__2025_12_23___LATEST_82fae59dda534c4594c5401129ed6efd.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 125 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-115749_251223-115750__2025_12_23___LATEST_c22b61819a2244a3954c9758784bc534.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-115749_251223-115750__2025_12_23___LATEST_c54a83ad12bc496d8f223899a1b99513.json
[SUCCESS] ✅   └─ Saved 30 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-090333_251223-090339__2025_12_23___LATEST_d165770ade2242289eb582758c0b4b52.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-115749_251223-115750__2025_12_23___LATEST_e2e745cc7e67425b99ed69d0453b23d8.jso12_23___LATEST_c22b61819a2244a3954c9758784bc534.json
[SUCCESS] ✅   └─ Saved 16 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-115749_251223-115750__2025_12_23___LATEST_c54a83ad12bc496d8f223899a1b99513.json
[SUCCESS] ✅   └─ Saved 30 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-090333_251223-090339__2025_12_23___LATEST_d165770ade2242289eb582758c0b4b52.json
[SUCCESS] ✅   └─ Saved 6 events → log_backup_staging_20251223/_aws_lambda_tournamentConsolidator-staging/251223-115749_251223-115750__2025_12_23___LATEST_e2e745cc7e67425b99ed69d0453b23d8.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 58 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 55 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-115749_251223-115752__2025_12_23___LATEST_172bb24cf8cc40e0bedac2b2d910298f.json
[SUCCESS] ✅   └─ Saved 113 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-115750_251223-115752__2025_12_23___LATEST_2fa32f2cf1d34411b48ca573074cfd03.json
[SUCCESS] ✅   └─ Saved 300 events → log_backup_staging_20251223/_aws_lambda_venueDetailsUpdater-staging/251223-090333_251223-090339__2025_12_23___LATEST_4a2b1677dcc7439da7f0dbb196df5288.json
[SUCCESS] ✅   └─ Saved 117 events → log_backup_staging_20251223/_aws_lambda_venueDetail[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.

======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004hnnode  n  ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt
This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scannedble DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items fro5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from 52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/RecurringGame-fosb7[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhcting...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 11 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 11 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing tableNFO] Scanned 6 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 6 items from User-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 11 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ [SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → backup_20251224_093424/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./backup_20251224_093424

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 11 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 11 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  [SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 8
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 6
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/getModelCount-staging             | 2
 /aws/lambda/refreshAllMetrics-staging         | 1
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 3
 /aws/lambda/tournamentConsolidator-staging    | 4
 /aws/lambda/venueDetailsUpdater-staging       | 6
 /aws/lambda/webScraperFunction-staging        | 2
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → logbackup_20251224_093622/_aws_lambda_autoScraper-staging/251223-120901_251223-120916__2025_12_23___LATEST_fea6823d3fb146d6b9431c8853c93742.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-120911_251223-120916__2025_12_23___LATEST_1badf47dde794bfe905d6[SUCCESS] ✅   └─ Saved 21 events → logbackup_20251224_093622/_aws_lambda_autoScraper-staging/251223-120901_251223-120916__2025_12_23___LATEST_fea6823d3fb146d6b9431c8853c93742.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-120911_251223-120916__2025_12_23___LATEST_1badf47dde794bfe905d6bd5a00e1a4a.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-223521_251223-223521__2025_12_23___LATEST_1e4f750aa7a24514beccc9984aaeb14b.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-223521_251223-223522__2025_12_23___LATEST_396432c738164956acdfac46ad578858.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-115749_251223-115751__2025_12_23___LATEST_4764424a212243ad9d60dc23ac8bdd04.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-120913_251223-120913__2025_12_23___LATEST_6bb568b538e64e118ba72310f5b31136.json
[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251224_093622/_aws_lambda_entityVenueDashMetricCounter-staging/251223-223521_251223-223522__2025_12_23___LATEST_7e7c7b47a6cb4e91840391caa141006b.json
[SUCCESS] ✅   └─ Saved 12 events → lo[SUCCESS] ✅   └─ Saved 151 events → logbackup_20251224_093622/_aws_lambda_gameDataEnricher-staging/251223-120906_251223-120916__2025_12_23___LATEST_ab4d74b9bbcf452abcc694eed614c7e1.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 151 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_911d4e562f384228972a01622d3f9faa.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_c92953efc3764e4ca0e978601f0a87e8.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_d6808b6b7e7e4e6896048a5dad793807.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-115750_251223-115750__2025_12_23___LATEST_e8459fd9e8794934ab951d935492b75a.json
[SUCCESS] ✅   └─ Saved 41 events → logbackup_2[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_c92953efc3764e4ca0e978601f0a87e8.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_d6808b6b7e7e4e6896048a5dad793807.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-115750_251223-115750__2025_12_23___LATEST_e8459fd9e8794934ab951d935492b75a.json
[SUCCESS] ✅   └─ Saved 41 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-120911_251223-120916__2025_12_23___LATEST_eb234fee6e054c9f82f305a1b657ba92.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_093622/_aws_lambda_gameFinancialsProcessor-staging/251223-223521_251223-223521__2025_12_23___LATEST_f5d54b35c2b2464ba5df6fcfa1b09e82.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 81 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/ga[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_093622/_aws_lambda_getModelCount-staging/251223-122348_251223-122350__2025_12_23___LATEST_470f109eedee4533b690afe0e17d7450.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_093622/_aws_lambda_getModelCount-staging/251223-122348_251223-122350__2025_12_23___LATEST_64cda0ba9317497b87f85b0a734a9546.json
[SUCCESS] ✅ Finished /aws/lambda/getModelCount-staging: 38 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getModelCount-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 17 events → logbackup_20251224_093622/_aws_lambda_refreshAllMetrics-staging/251223-122144_251223-122157__2025_12_23___LATEST_452c5816fb294a3ca1504175745cd9db.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 17 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_093622/_aws_lambda_saveGameFunction-staging/251223-120909_251223-120916__2025_12_23___LATEST_8e82bce2250c4eefb3a5901b8106bf78.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_093622/_aws_lambda_scraperManagement-staging/251223-120816_251223-1[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_093622/_aws_lambda_saveGameFunction-staging/251223-120909_251223-120916__2025_12_23___LATEST_8e82bce2250c4eefb3a5901b8106bf78.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_093622/_aws_lambda_scraperManagement-staging/251223-120816_251223-121044__2025_12_23___LATEST_06ef647e91124b08b23a3dc9bee4cc48.json
[SUCCESS] ✅   └─ Saved 215 events → logbackup_20251224_093622/_aws_lambda_scraperManagement-staging/251223-120816_251223-121541__2025_12_23___LATEST_4b8cf28439374c1094a7f31d87891202.json
[SUCCESS] ✅   �[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251224_093622/_aws_lambda_tournamentConsolidator-staging/251223-223522_251223-223522__2025_12_23___LATEST_5b0e5dab2f71474fb98b2a51789bc4d2.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_093622/_aws_lambda_tournamentConsolidator-staging/251223-223522_251223-223522__2025_12_23___LATEST_6053eb1f65bf43b89d4773de222a0721.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251224_093622/_aws_lambda_tournamentConsolidator-staging/251223-120911_251223-120916__2025_12_23___LATEST_b8cde2d42d9f40e78d1b572b46ebdc11.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 181 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-120913_251223-120917__2025_12_23___LATEST_123c642086fa44bca59eb99775a41156.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-223521_251223-223523__2025_12_23___LATEST_5870fee8a9e4425b[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 181 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-120913_251223-120917__2025_12_23___LATEST_123c642086fa44bca59eb99775a41156.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-223521_251223-223523__2025_12_23___LATEST_5870fee8a9e4425bbc31c5ad23fe2e4d.json
[SUCCESS] ✅   └─ Saved 59 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-223522_251223-223523__2025_12_23___LATEST_5f1188db31f948569d7b4b72ccc2ba1a.json
[SUCCESS] ✅   └─ Saved 59 events → logbackup_20251224_093622/_aws_lambda_venueDetailsUpdater-staging/251223-223521_251223-223523__2025_12_23___LATEST_8741eea887174df18d03885f017c3388.json
[SUCCESS] ✅  [SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_093622/_aws_lambda_webScraperFunction-staging/251223-121456_251223-121456__2025_12_23___LATEST_8144275a73d84bdfaf2d88f719b63fdd.json
[SUCCESS] ✅   └─ Saved 145 events → logbackup_20251224_093622/_aws_lambda_webScraperFunction-staging/251223-120904_251223-120915__2025_12_23___LATEST_9d72e1e3ae3d4bb893c85173db294535.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 146 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.

======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreference-fosb7ek5argnhctz4odpt52eia-staging
- Venue-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "backup" to continue: [28Gbackup
[INFO] Saving backups to directory: ./dbbackup_20251224_144221
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 11 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 11 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from t[SUCCESS] ✅ Saved 45 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Marz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing tabO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data fr...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-stag[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all dataata from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 38 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 38 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...Saved 38 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_144221/VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.csv
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_144221

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhct-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 38 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 38 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] StartingtyMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 175 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 193 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO]   Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Sca /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/tournamentConsolidator-staging    | 3
 /aws/lambda/userManagement-staging            | 2
 /aws/lambda/venueDetailsUpdater-staging       | 5
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 21 events → logbackup_20251224_144523/_aws_lambda_autoScraper-staging/251223-224549_251223-224605__2025_12_23___LATEST_c9cdde1c2a444a278bb6525923f6da0d.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_entityVenueDashMetricCounter-staging/251223-224603_251223-224603__2025_12_23___LATEST_7260808966e945eda48a8a[SUCCESS] ✅   └─ Saved 21 events → logbackup_20251224_144523/_aws_lambda_autoScraper-staging/251223-224549_251223-224605__2025_12_23___LATEST_c9cdde1c2a444a278bb6525923f6da0d.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_entityVenueDashMetricCounter-staging/251223-224603_251223-224603__2025_12_23___LATEST_7260808966e945eda48a8aabcd4e8cb9.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_144523/_aws_lambda_entityVenueDashMetricCounter-staging/251223-224558_251223-224605__2025_12_23___LATEST_8889b67cdfc64ba6ba2ec429d4c31a21.json
[SUCCESS] ✅   └─ Saved 15 events → logbackup_20251224_144523/_aws_lambda_entityVenueDashMetricCounter-staging/251224-034316_251224-034318__2025_12_24___LATEST_4c7f8467bf2b4e6a97810f7bb618725d.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_144523/_aws_lambda_entityVenueDashMetricCounter-staging/251224-034316_251224-034318__2025_12_24___LATEST_7ddc1ab87d544e9ca942bb162aece747.json
[SUCCESS] ✅   └─ Saved 8 events → log[SUCCESS] ✅   └─ Saved 152 events → logbackup_20251224_144523/_aws_lambda_gameDataEnricher-staging/251223-224553_251223-224605__2025_12_23___LATEST_977154949f99432b97deae244e1d3976.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 152 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251223-224333_251223-224333__2025_12_23___LATEST_17dc3fa413ad48b480007923a22002c2.json
[SUCCESS] ✅   └─ Saved 40 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251223-224558_251223-224604__2025_12_23___LATEST_911d4e562f384228972a01622d3f9faa.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251224-034316_251224-034316__2025_12_24___LATEST_0d1f4f0b53b84e89a087c[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251223-224333_251223-224333__2025_12_23___LATEST_17dc3fa413ad48b480007923a22002c2.json
[SUCCESS] ✅   └─ Saved 40 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251223-224558_251223-224604__2025_12_23___LATEST_911d4e562f384228972a01622d3f9faa.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_144523/_aws_lambda_gameFinancialsProcessor-staging/251224-034316_251224-034316__2025_12_24___LATEST_0d1f4f0b53b84e89a087c0634deb41e7.json
[SUCCESS] ✅   └[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251224_144523/_aws_lambda_gameIdTracker-staging/251223-225634_251223-225637__2025_12_23___LATEST_4ffa0d61f6814bc8ba557b0cc9d67f45.json
[SUCCESS] ✅   └─ Saved 37 events → logbackup_20251224_144523/_aws_lambda_gameIdTracker-staging/251223-224423_251223-224543__2025_12_23___LATEST_bbf61994383d480ba7bc716665ba9f04.json
[SUCCESS] ✅   └─ Saved 28 events → logbackup_20251224_144523/_aws_lambda_gameIdTracker-staging/251223-224543_251223-224610__2025_12_23___LATEST_d1a919ebd4464d49a2337ab92cd9433c.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 81 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 17 events → logbackup_20251224_144523/_aws_lambda_refreshAllMetrics-staging/251223-225728_251223-225741__2025_12_23___LATEST_41d77d8a7b5b483fb75f34b065635862.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 17 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_144523/_a[INFO] 
--- /aws/lambda/refreshAllMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/refreshAllMetrics-staging
[SUCCESS] ✅   └─ Saved 17 events → logbackup_20251224_144523/_aws_lambda_refreshAllMetrics-staging/251223-225728_251223-225741__2025_12_23___LATEST_41d77d8a7b5b483fb75f34b065635862.json
[SUCCESS] ✅ Finished /aws/lambda/refreshAllMetrics-staging: 17 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/refreshAllMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_144523/_aws_lambda_saveGameFunction-staging/251223-224556_251223-224605__2025_12_23___LATEST_1a014345e3b54c9ca3fb6bb7c5302c3c.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 191 events → logbackup_20251224_144523/_aws_lambda_scraperManagement-staging/251223-224418_251223-225639__2025_12_23___LATEST_16cc7fe21d8b424ea2a49595c9ef3666.json
[SUCCESS] ✅   �[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_tournamentConsolidator-staging/251223-224428_251223-224428__2025_12_23___LATEST_efe17f6a5bfd4251a2ec746872a746d1.json
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_144523/_aws_lambda_tournamentConsolidator-staging/251224-034316_251224-034317__2025_12_24___LATEST_bf5b05d6b725452f86dd716b361fb5e7.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/userManagement-staging ---
[INFO] Starting backup for: /aws/lambda/userManagement-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_144523/_aws_lambda_userManagement-staging/251224-014533_251224-014619__2025_12_24___LATEST_279f942335b840278f33b7c54d22545f.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_144523/_aws_lambda_userManagement-staging/251224-025938_251224-030032__2025_12_24___LATEST_d4616ed6d75d4d7bb47d31336319f9ed.json
[SUCCESS] ✅ Finished /aws/lambda/userManagement-staging: 26 events.
[SUCCES[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/userManagement-staging ---
[INFO] Starting backup for: /aws/lambda/userManagement-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_144523/_aws_lambda_userManagement-staging/251224-014533_251224-014619__2025_12_24___LATEST_279f942335b840278f33b7c54d22545f.json
[[SUCCESS] ✅   └─ Saved 59 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034316_251224-034318__2025_12_24___LATEST_2c383e43caa54e62bb677e0347c5896d.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034318_251224-034318__2025_12_24___LATEST_7af0eb9e7f3742ec857d5c9349b45ef3.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034316_251224-034318__2025_12_24___LATEST_a2f42f8e9fe74d3eb7841401e76f3fb0.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034316_251224-034319__2025_12_24___LATEST_c5875eefedaa44c699541ef35a52944f.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 587 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFu[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034316_251224-034318__2025_12_24___LATEST_a2f42f8e9fe74d3eb7841401e76f3fb0.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_144523/_aws_lambda_venueDetailsUpdater-staging/251224-034316_251224-034319__2025_12_24___LATEST_c5875eefedaa44c699541ef35a52944f.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 587 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 148 events → logbackup_20251224_144523/_aws_lambda_webScraperFunction-staging/251223-224551_251223-224604__2025_12_23___LATEST_4de0328906694f48bcfe7a197b29ea36.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 148 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCES./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odgnhctz4odpt52eia-staging → dbbackup_20251224_201712/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing tagnhctz4odpt52eia-staging → dbbackup_20251224_201712/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ SavgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpINFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-stagINFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-foFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplaFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from User-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 22 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 22 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/UserAuditLog-fosb7ek5argnhctctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhcctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_201712/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_201712

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ SucceEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear aEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 22 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 22 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items fromentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
==========entSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 11 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 4
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 4
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/getDatabaseMetLATEST_eb3041d1cb1b4dcba1c170a6e58cef85.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091718_251224-091720__2025_12_24___LATEST_669e3beca79248448a81134ad4f2d93f.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-LATEST_eb3041d1cb1b4dcba1c170a6e58cef85.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091718_251224-091720__2025_12_24___LATEST_669e3beca79248448a81134ad4f2d93f.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091718_251224-091720__2025_12_24___LATEST_8592122938ae46a59dea639bc19fec82.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-055122_251224-055122__2025_12_24___LATEST_b1d771b8a0074623b924b28daa20346a.json
[SUCCESS] ✅   └─ Saved 4 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091718_251224-091719__2025_12_24___LATEST_d23dcc6e346f454da3d84133de11e31a.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-055120_251224-055125__2025_12_24___LATEST_d4c514cdfeaa438f98b04c9e08059de2.json
[SUCCESS] ✅   └─ Saved 20 events → logbackup_20251224_201723/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091718_251224-091720__2025_12_24___LATEST_f8cd252fb11f4244aa1736802dc0c8b2.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 112 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 162 events → logbackup_20251224_201723/_aws_lambda_gameDataEnricher-staging/251224-055115_251224-055125__2025_12_24___LATEST_8aae691a3d734a988479810c6ede9c7d.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 162 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting bac[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_201723/_aws_lambda_gameFinancialsProcessor-staging/251224-091718_251224-091718__2025_12_24___LATEST_9c948d00de5c4d648168dab5c2f877e8.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251224_201723/_aws_lambda_gameFinancialsProcessor-staging/251224-091718_251224-091718__2025_12_24___LATEST_9f3fe98430f24cea878dbeea36e3821a.json
[SUCCESS] ✅   └─ Saved 17 events → logbackup_20251224_201723/_aws_lambda_gameFinancialsProcessor-staging/251224-055120_251224-055123__2025_12_24___LATEST_c428b47c98204124bde26c5b35db8983.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 71 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 28 events → logbackup_20251224_201723/_aws_lambda_gameIdTracker-staging/251224-055104_251224-055127__2025_12_24___LATEST_87e395806470476e8ea16eb5fbad021f.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_201723/_aws_lambda_gameIdTracker-staging/251224-055104_251224-055107__2025_12_24___LATEST_aebfe737ef4d4fbcb2be3a808674791c.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 41 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/getDatabaseMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/getDatabaseMetrics-staging
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_201723/_aws_lambda_getDatabaseMetrics-staging/251224-090206_251224-090210__2025_12_24___LATEST_ea7865379dc5427f8ae95c4b2bfdd198.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_201723/_aws_lambda_getDatabaseMetrics-staging/251224-090206_251224-090210__2025_12_24___LATEST_f338e937555c4455b3a66ff5a487a352.json
[SUCCESS] ✅ Finished /aws/lambda/getDatabaseMetrics-staging: 24 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getDatabaseMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251224_201723/_aws_lambda_saveGameFunction-staging/251224-055118_251224-055125__2025_12_24___LATEST_721c5df309db43198acd11fc8c86cc2a.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 26 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_201723/_aws_lambda_scraperManagement-staging/251224-055103_251224-055106__2025_12_24___LATEST_2d329c0a6e134fe9923ce1e89b552282.json
[SUCCESS] ✅   └─ Saved 67 events → logbackup_20251224_201723/_aws_lambda_scraperManagement-staging/251224-055104_251224-055128__2025_12_24___LATEST_66b73fce4b714a97aa1c4ab6da926022.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_201723/_aws_lambda_scraperManagement-staging/251224-055103_251224-055106__2025_12_24___LATEST_7b4ffb6ae28b4abd8be1808a6ecb1e34.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251224_201723/_aws_lambda_scraperManagement-staging/251224-055104_251224-055112__2025_12_24___LATEST_967da48d55234244909861683eb7188d.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 116 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_201723/_aws_lambda_tournamentConsolidator-staging/251224-091718_251224-091719__2025_12_24___LATEST_55234d30b5ed4089a4c16fafb35118d7.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251224_201723/_aws_lambda_tournamentConsolidator-staging/251224-055120_251224-055125__2025_12_24___LATEST_8d9ce95042d74c2eaecc604c3ccc23b1.json
[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251224_201723/_aws_lambda_tournamentConsolidator-staging/251224-091718_251224-091719__2025_12_24___LATEST_b001e13672d946e3a6ae4ed96c0ab634.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 58 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/ve[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251224_201723/_aws_lambda_tournamentConsolidator-staging/251224-055120_251224-055125__2025_12_24___LATEST_8d9ce95042d74c2eaecc604c3ccc23b1.json
[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251224_201723/_aws_lambda_tournamentConsolidator-staging/251224-091718_251224-091719__2025_12_24___LATEST_b001e13672d946e3a6ae4ed96c0ab634.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 58 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-091718_251224-091718__2025_12_24___LATEST_450f00a44af24676a7d3235ffd5e762d.json
[SUCCESS] ✅   └─ Saved 117 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-091718_251224-091720__2025_12_24___LATEST_89913d6ddd7d4f8bb7ce34fc05566ff3.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-091718_251224-091718__2025_12_24___LATEST_b03fc94cf9674b58b0a88b43b4e3a6d9.json
[SUCCESS] ✅   └─ Saved 61 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-055121_251224-055123__2025_12_24___LATEST_b7b7f656dfa94b3f94c9b01bfc9ed247.json
[SUCCESS] ✅   └─ Saved 59 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-091718_251224-091720__2025_12_24___LATEST_b96b1271e6894438b6815c9bb30256ec.json
[SUCCESS] ✅   └─ Saved 233 events → logbackup_20251224_201723/_aws_lambda_venueDetailsUpdater-staging/251224-055120_251224-055125__2025_12_24___LATEST_fa76f056db924c6ebbb47afebcf616b6.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 580 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 147 events → logbackup_20251224_201723/_aws_lambda_webScraperFunction-staging/251224-055113_251224-055124__2025_12_24___LATEST_73549d40d3d0457789c8ec1b1f01f76f.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 147 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCES./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odgnhctz4odpt52eia-staging → dbbackup_20251224_203416/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing tagnhctz4odpt52eia-staging → dbbackup_20251224_203416/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ SavgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpINFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-stagINFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-foFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplaFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from User-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/UserAuditLog-fosb7ek5argnhctz4z4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctzz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_203416/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_203416

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successtry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear alltry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EnteriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
==============eriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 11 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 2
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 3
 /aws/lambda/gameIdTracker-staging             | 4
 /aws/lambda/getDatabaseMetricsST_67f92bde2fda433f954189e660fa7a59.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → logbackup_20251224_203425/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091720_251224-091720__2025_12_24___LATEST_d23dcc6e346f454da3d84133de11e31a.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_203425/_aws_lambda_entityVenueDashMetricCounter-staging/251224-09252ST_67f92bde2fda433f954189e660fa7a59.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 4 events → logbackup_20251224_203425/_aws_lambda_entityVenueDashMetricCounter-staging/251224-091720_251224-091720__2025_12_24___LATEST_d23dcc6e346f454da3d84133de11e31a.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_203425/_aws_lambda_entityVenueDashMetricCounter-staging/251224-092524_251224-092530__2025_12_24___LATEST_f8cd252fb11f4244aa1736802dc0c8b2.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 162 events → logbackup_20251224_203425/_aws_lambda_gameDataEnricher-staging/251224-092520_251224-092526__2025_12_24___LATEST_04534dd8190742a79b73499079a52135.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 162 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting bac[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_203425/_aws_lambda_gameIdTracker-staging/251224-092507_251224-092509__2025_12_24___LATEST_28a07832390f4e9d9a4c6a26c33b1763.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_203425/_aws_lambda_gameIdTracker-staging/251224-092507_251224-092509__2025_12_24___LATEST_86ae01fb855949d7b44451f27015aa4d.json
[SUCCESS] ✅   └─ Saved 28 events → logbackup_20251224_203425/_aws_lambda_gameIdTracker-staging/251224-092507_251224-092509__2025_12_24___LATEST_8d52b1f4dc5543c3af811f57dc27e08d.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_203425/_aws_lambda_gameIdTracker-staging/251224-092507_251224-092509__2025_12_24___LATEST_de360bd99f084344886692e7f23b7147.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 67 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/getDatabaseMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/getDatabaseMetrics-staging
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_203425/_aws_lambda_getDatabaseMetrics-staging/251224-092449_251224-092453__2025_12_24___LATEST_8bb18a00e9c44410957db8dee0cee90a.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251224_203425/_aws_lambda_getDatabaseMetrics-staging/251224-092449_251224-092449__2025_12_24___LATEST_eae2a146bcc4452194e7225af98b796d.json
[SUCCESS] ✅ Finished /aws/lambda/getDatabaseMetrics-staging: 24 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getDatabaseMetrics-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 57 events → logbackup_20251224_203425/_aws_lambda_saveGameFunction-staging/251224-092522_251224-092524__2025_12_24___LATEST_b926567a6c14469481e4f7b25d86ae27.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 85 events → logbackup_20251224_203425/_aws_lambda_scraperManagement-staging/251224-092504_251224-092505__2025_12_24___LATEST_19325e5455dd408f92cd82ee2fee83ff.json
[SUCCESS] ✅   └─ Saved 35 events → logbackup_20251224_203425/_aws_lambda_saveGameFunction-staging/251224-092522_251224-092524__2025_12_24___LATEST_b926567a6c14469481e4f7b25d86ae27.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 85 events → logbackup_20251224_203425/_aws_lambda_scraperManagement-staging/251224-092504_251224-092505__2025_12_24___LATEST_19325e5455dd408f92cd82ee2fee83ff.json
[SUCCESS] ✅   └─ Saved 35 events → logbackup_20251224_203425/_aws_lambda_scraperManagement-staging/251224-092504_251224-092507__2025_12_24___LATEST_dbec89d2ac1b41f496f0115ddacb41fd.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 120 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_203425/_aws_lambda_tournamentConsolidator-staging/251224-093421_251224-093422__2025_12_24___LATEST_48158670443747adafdb9c9859e4d6c0.json
[SUCCESS] ✅   └─ Saved 30 events → logbackup_20251224_203425/_aws_lambda_tournamentConsolidator-staging/251224-092524_251224-092530__2025_12ing ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-093421_251224-093424__2025_12_24___LATEST_3b9f47750f0a436dad85311ab30016fc.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-093421_251224-093424__2025_12_24___LATEST_6eed2a1414cb4023979374360d4994b0.json
[SUCCESS] ✅   └─ Saved 300 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-092524_251224-092530__2025_12_24___LATEST_b03fc94cf9674b58b0a88b43b4e3a6d9.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-093421_251224-093423__2025_12_24___LATEST_cd20b4daabde4a99a2b62139f90180d9.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging:[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-093421_251224-093424__2025_12_24___LATEST_6eed2a1414cb4023979374360d4994b0.json
[SUCCESS] ✅   └─ Saved 300 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-092524_251224-092530__2025_12_24___LATEST_b03fc94cf9674b58b0a88b43b4e3a6d9.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251224_203425/_aws_lambda_venueDetailsUpdater-staging/251224-093421_251224-093423__2025_12_24___LATEST_cd20b4daabde4a99a2b62139f90180d9.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 581 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 147 events → logbackup_20251224_203425/_aws_lambda_webScraperFunction-staging/251224-092517_251224-092525__2025_12_24___LATEST_8c6564f16d3c439091dfebae6e7dc2da.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 147 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCES./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odgnhctz4odpt52eia-staging → dbbackup_20251224_221411/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhackup_20251224_221411/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ SavgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Stareia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpINFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items froage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-foFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-st from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from User-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/UserAuditLog-fosb7ek5argnhctz4z4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_221411/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_221411

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successtry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketintaging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 3 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EnteriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
==============================================pt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 10 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 6
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/saveGameFunction-s✅ Finished /aws/lambda/autoScraper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093423_251224-093423__2025_12_24___LATEST_0e63e032e35340e889be471aa46bd0d4.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-110537_251224-110541__2025_12_24___LATEST_17ee94afc245487d8d174a42494d89c0.json
[SUCCESSaper-staging: 21 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093423_251224-093423__2025_12_24___LATEST_0e63e032e35340e889be471aa46bd0d4.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-110537_251224-110541__2025_12_24___LATEST_17ee94afc245487d8d174a42494d89c0.json
[SUCCESS] ✅   └─ Saved 20 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093421_251224-093423__2025_12_24___LATEST_1b99d1b5078a4689aeedf50fc2c29aff.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-111415_251224-111417__2025_12_24___LATEST_360dc943b7bc4fe08f8daac4dd6bd425.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093423_251224-093423__2025_12_24___LATEST_62fb9f5a13f24d2082940b61dd402c8f.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093421_251224-093423__2025_12_24___LATEST_d40158729fee4005ba0f75d020577e87.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251224_221419/_aws_lambda_entityVenueDashMetricCounter-staging/251224-093421_251224-093423__2025_12_24___LATEST_e698883273534d19985f3515fbc116b6.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 139 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 162 events → logbackup_20251224_221419/_aws_lambda_gameDataEnricher-staging/251224-110532_251224-110532__2025_12_24___LATEST_7fe47e51cd354e3fa81cfc321760c49e.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 162 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_221419/_aws_lambda_gameFinancialsProcessor-staging/251224-111416_251224-111416__2025_12_24___LATEST_062ece9cfd2c405b8cfd4f876964cc1f.json
[SUCCESS] ✅   └─ Saved 41 events → logbackup_20251224_221419/_aws_lambda_gameFinancialsProcessor-staging/251224-110536_251224-110539__2025_12_24___LATEST_0cfcf406bf534f25a9c64677a8f2d068.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_221419/_aws_lambda_gameFinancialsProcessor-staging/251224-111416_251224-111416__2025_12_24___LATEST_6b1a7667d5394a5bacc9be6a2d56e7d1.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_221419/_aws_lambda_gameFinancialsProcessor-staging/251224-111416_251224-111416__2025_12_24___LATEST_e90bc940c6734778a6ab7c554782f54e.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 54 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO]veGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 57 events → logbackup_20251224_221419/_aws_lambda_saveGameFunction-staging/251224-110534_251224-110534__2025_12_24___LATEST_091878e03c724f24b35a79e1d39fc0da.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_221419/_aws_lambda_scraperManagement-staging/251224-110501_251224-11050O] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 57 events → logbackup_20251224_221419/_aws_lambda_saveGameFunction-staging/251224-110534_251224-110534__2025_12_24___LATEST_091878e03c724f24b35a79e1d39fc0da.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 57 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251224_221419/_aws_lambda_scraperManagement-staging/251224-110501_251224-110503__2025_12_24___LATEST_50497790b1cb4c2e878024e4ed87c3a7.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251224_221419/_aws_lambda_scraperManagement-staging/251224-110503_251224-110505__2025_12_24___LATEST_61f8de6377364227b2832e511430ca6e.json
[SUCCESS] ✅   └─ Saved 79 events → logbackup_20251224_221419/_aws_lambda_scraperManagement-staging/251224-110501_251224-110544__2025_12_24___LATEST_a8f605266aa44db2a20e47ad20155317.json
[SUCCESS] ✅ Finished /[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_221419/_aws_lambda_tournamentConsolidator-staging/251224-111415_251224-111416__2025_12_24___LATEST_3df5229940cd40028c47791afa78d91c.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 53 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 181 events → logbackup_20251224_221419/_aws_lambda_venueDetailsUpdater-staging/251224-110539_251224-110540__2025_12_24___LATEST_14fddc4ca8ee4ddfb536689117cbde09.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251224_221419/_aws_lambda_venueDetailsUpdater-staging/251224-111415_251224-111418__2025_12_24___LATEST_628b0b5af7d141209515d620509644e3.json
[SUCCESS] ✅   └─ Saved 233 events → logbackup_20251224_221419/_aws_lambda_venueDetailsUpdater-staging/251224-110537_251224-110541__2025_12_24___LATEST_741709b77e924c8d936145e8bdd08905.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 527 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 147 events → logbackup_20251224_221419/_aws_lambda_webScraperFunction-staging/251224-110530_251224-110530__2025_12_24___LATEST_2e55e01f0079450caaa727ca1cfd6368.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 147 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.

======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- UserPreference-fosb7ek5argnhctz4odpt52eia-staging
- Venue-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "backup" to continue: [28Gbackup
[INFO] Saving backups to directory: ./dbbackup_20251224_222134
[INFO] 
Processing table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Game-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Player-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScraperJob-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Scraper[INFO] Table ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScraperJob-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScraperState-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
ProceournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/Tournamenb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from User-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_222134/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_222134

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DAodpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gprnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-st
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted l data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 0 items
  ScraperJob: 0 items
  ScraperState: 0 items
  ScrapeStructure: 0 items
  ScrapeURL: 0 items

  TOTAL: 0 items to delete
[INFO] All tables are already empty. Nothing to do.

======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
====da/venueDetailsUpdater-staging       | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_222142/_aws_lambda_entityVenueDashMetricCounter-staging/251224-111417_251224-111417__2025_12_24___LATEST_1ad6eaa524cc4132a361a3dc4664e59e.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_222142/_aws_lambda_entityVenueDashMetricCounter-staging/251224-111422_251224-111423__2025_12_24___LATEST_db46c7ecb7124f3598882d1ba43f0086.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashM[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251224_222142/_aws_lambda_entityVenueDashMetricCounter-staging/251224-111417_251224-111417__2025_12_24___LATEST_1ad6eaa524cc4132a361a3dc4664e59e.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251224_222142/_aws_lambda_entityVenueDashMetricCounter-staging/251224-111422_251224-111423__2025_12_24___LATEST_db46c7ecb7124f3598882d1ba43f0086.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 12 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 5 events → logbackup_20251224_222142/_aws_lambda_gameFinancialsProcessor-staging/251224-111433_251224-111433__2025_12_24___LATEST_062ece9cfd2c405b8cfd4f876964cc1f.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 5 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 5 events → logbackup_20251224_222142/_aws_lambda_tournamentConsolidator-staging/251224-111423_251224-111423__2025_12_24___LATEST_236bcbd88ef74b13a92389e775955cd4.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 5 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 58 events → logbackup_20251224_222142/_aws_lambda_venueDetailsUpdater-staging/251224-111433_251224-111433__2025_12_24___LATEST_628b0b5af7d141209515d620509644e3.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 58 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[SUCCES./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script ./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odgnhctz4odpt52eia-staging → dbbackup_20251224_224019/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing tagnhctz4odpt52eia-staging → dbbackup_20251224_224019/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Game-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging is empty. No bacll data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMell data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerResult-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52ei/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 399 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 796 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1200 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7e
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table T
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from User-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from User-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/User-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251224_224019/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctzk5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_224019

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARk5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251224_224019

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhcRVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 5 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 14 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeAttempt-fosb7ek5RVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 5 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 14 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 14 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 4 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 /aws/lambda/gameIdTracker-staging             | 2
 /aws/lambda/scraperManagement-staging         | 2
 /aws/lambda/webScraperFunction-staging        | 1
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/autoScraper-staging ---
[INFO] Starting backup for: /aws/lambda/autoScraper-staging
[SUCCESS] ✅   └─ Saved 51 events → logbackup_20251224_224028/_aws_lambda_autoScraper-staging/251224-113533_251224-113534__2025_12_24___LATEST_263da64e3390404f9b13f4e6c46413c4.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 51 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251224_224028/_aws_lambda_gameIdTracker-staging/251224-113521_251224-113523__2025_12_24___LATEST_2206ccd157524a82832c98fa0dab0394.json
[SUCCESS] ✅   └─ Saved 37 events → logbackup_20251224_224028/_aws_lambda_gameIdTracker-staging/251224-113521_251224-113524__12_24___LATEST_bf17e8a1f32b484396b7b9982e0fb1ba.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 90 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 144 events → logbackup_20251224_224028/_aws_lambda_webScraperFunction-staging/251224-113535_251224-113540__2025_12_24___LATEST_80bed00b5f644378980043b71758bd21.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 144 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.

======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ekStarting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-stag Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up om table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 110 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 110 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 173 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 173 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 165 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 165 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.csv
[pty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RecurringGameMetrics-fosb7ek5argnNFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1108 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/ScraperJob-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/ScraperState-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SociaialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ia-staging...
[INFO] Scanned 1601 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 5 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing taosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eg → dbbackup_20251225_081456/UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_081456/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251225_081456

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 5 items from Game-fosb7ek5argnhctz4odpitems from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from Player-fosb7ek5-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 5 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 143 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 110 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 110 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 173 items from PlayerResult-fos 125 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhsb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 138 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 165 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 165 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 50 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 75 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 100 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 125 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 150 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 162 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 162 items from PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 25 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Deleted 27 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 27 items from UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all SS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
   0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 10 items
  ScraperJob: 1 items
  ScraperState: 1 items
  ScrapeStructure: 2 items
  ScrapeURL: 5 items

  TOTAL: 19 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 10 items...
[SUCCESS] ✅ Cleared 10 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 1 items...
[SUCCESS] ✅ Cleared 1 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 5 items...
[SUCCESS] ✅ Cleared 5 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 19 items total.
[SUCCESS] ✅ S3Storage preserved - cached HTML references intact.
============================================================


======================================================================
   STEP 4/4: Backup & Clear CloudWatch Logs
======================================================================

[WARN] ⚠️  --- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---
[WARN] ⚠️  Target Suffix: "staging"
[INFO] Scanning AWS CloudWatch for groups matching suffix: "staging"...
[INFO] Found 14 groups. Counting streams...

------------------------------------------------------------
 LOG GROUP NAME                                | STREAMS
------------------------------------------------------------
 /aws/lambda/autoScraper-staging               | 1
 ...bda/entityVenueDashMetricCounter-staging   | 1
 /aws/lambda/gameDataEnricher-staging          | 1
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 3
 /aws/lambda/getDatabaseMetrics-staging        | 2
 /aws/lambda/getModelCount-staging             | 12
 /aws/lambda/playerDataProcessor-staging       | 6
 /aws/lambda/s3ManagementFunction-s0250fec47e7497fa82cb4bdf2fcec8a.json
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 40 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251225_081504/_aws_lambda_entityVenueDashMetricCounter-staging/251224-211500_251224-211502__2025_12_24___LATEST_382d76b096154da08cc7cc89fa04734b.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251225_081504/_aws_lambda_entityVenueDashMetricCounter-staging/251224-114354_251224-114400__2025_12_24___LATESjson
[SUCCESS] ✅ Finished /aws/lambda/autoScraper-staging: 40 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/autoScraper-staging
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251225_081504/_aws_lambda_entityVenueDashMetricCounter-staging/251224-211500_251224-211502__2025_12_24___LATEST_382d76b096154da08cc7cc89fa04734b.json
[SUCCESS] ✅   └─ Saved 56 events → logbackup_20251225_081504/_aws_lambda_entityVenueDashMetricCounter-staging/251224-114354_251224-114400__2025_12_24___LATEST_d4617e08be8d4e42b0f5a73a2c156501.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 68 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 162 events → logbackup_20251225_081504/_aws_lambda_gameDataEnricher-staging/251224-114349_251224-114359__2025_12_24___LATEST_142dbb5cbb6e4aec90e7751b7ad5ae1f.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 162 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251225_081504/_aws_lambda_gameFinancialsProcessor-staging/251224-211500_251224-211501__2025_12_24___LATEST_390898d1827b4ec190c486e174772314.json
[SUCCESS] ✅   └─ Saved 11 events → logbackup_20251225_081504/_aws_lambda_gameFinancialsProcessor-staging/251224-211500_251224-211501__2025_12_24___LATEST_42048b01d9c0450e9b262531419c6847.json
[SUCCESS] ✅   └─ Saved 41 events → logbackup_20251225_081504/_aws_lambda_gameFinancialsProcessor-staging/251224-114354_251224-114359__2025_12_24___LATEST_605eb2060ebd4e2e90351fa461eaae01.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251225_081504/_aws_lambda_gameFinancialsProcessor-staging/251224-211500_251224-211501__2025_12_24___LATEST_a489f39aba174c4d98066606940b2296.json
[SUCCESS] ✅ Finished /aws/lambda/gameFinancialsProcessor-staging: 69 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameFinancialsProcessor-staging
[INFO] 
--- /aws/lambda/gameIdTracker-staging ---
[INFO] Starting backup for: /aws/lambda/gameIdTracker-staging
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_081504/_aws_lambda_gameIdTracker-staging/251224-114331_251224-114340__2025_12_24___LATEST_00c9745d6e78481dac0321745c3068dc.json
[SUCCESS] ✅   └─ Saved 69 events → logbackup_20251225_081504/_aws_lambda_gameIdTracker-staging/251224-114331_251224-115120__2025_12_24___LATEST_2206ccd157524a82832c98fa0dab0394.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_081504/_aws_lambda_gameIdTracker-staging/251224-115029_251224-115120__2025_12_24___LATEST_d48f9edcbb924404963235d7a1c291e6.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 125 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/getDatabaseMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/getDatabaseMetrics-staging
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-114632_251224-115254__2025_12_24___LATEST_222c2c50204e4ec0b5a7a84a629025a0.json
[SUCCESS] ✅   └─ Saved 91 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-121810_251224-123953__2025_12_24___LATEST_38e27d3b10924cfb8f8e7442bc65a226.json
[SUCCESS] ✅   └─ Saved 73 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-121810_251224-122337__2025_12_24___LATEST_42d9af72f5f04a1d99e543dd04933886.json
[SUCCESS] ✅   └─ Saved 91 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-120016_251224-120425__2025_12_24___LATE04/_aws_lambda_getModelCount-staging/251224-114632_251224-115254__2025_12_24___LATEST_222c2c50204e4ec0b5a7a84a629025a0.json
[SUCCESS] ✅   └─ Saved 91 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-121810_251224-123953__2025_12_24___LATEST_38e27d3b10924cfb8f8e7442bc65a226.json
[SUCCESS] ✅   └─ Saved 73 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/2512[SUCCESS] ✅   └─ Saved 127 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-114632_251224-115254__2025_12_24___LATEST_908e09a182254556ba8877e69c5f7cd0.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-124532_251224-125017__2025_12_24___LATEST_9ed2993ceb4d4d53a3d547cf5ca1f268.json
[SUCCESS] ✅   └─ Saved 91 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-130812_251224-131519__2025_12_24___LATEST_a3c429e5c4a344518fd7e8ed03df29e3.json
[SUCCESS] ✅   └─ Saved 91 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-130812_251224-131518__2025_12_24___LATEST_d7367b9173a4457e8bc7e55bee8ddc35.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-123025_251224-123027__2025_12_24___LATEST_e35abf6d468e4202b0efe8e7422dbd6a.json
[SUCCESS] ✅   └─ Saved 37 events → logbackup_20251225_081504/_aws_lambda_getModelCount-staging/251224-124532_251224-125018__2025_12_24___LATEST_f510b6f383d5449aa8ad01bea0ce0068.json
[SUCCESS] ✅ Finished /aws/lambda/getModelCount-staging: 876 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getModelCount-staging
[INFO] 
--- /aws/lambda/playerDataProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/playerDataProcessor-staging
[SUCCESS] ✅   └─ Saved 1053 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-114357_251224-114903__2025_12_24___LATEST_05c809406a67442db78a8eafabfd5d84.json
[SUCCESS] ✅   └─ Saved 209 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-114354_251224-114401__2025_12_24___LATEST_641ad618ea4f4622bd4002bfa26bca77.json
[SUCCESS] ✅   └─ Saved 1058 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-114359_251224-114901__2025_12_24___LATEST_731111876ba94d79a6cf72929764013b.json
[SUCCESS] ✅   └─ Saved 811 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-114358_251224-114420__2025_12_24___LATEST_7eaf686e3ed248d18d5d5e9533f22edd.json
[SUCCESS] ✅   └─ Saved 1015 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-114356_251224-114904__2025_12_24___LATEST_c065363b01074e3d8c3acdf26e920d5d.json
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-115055_251224-115055__2025_12_24___LATEST_d15e5e0e5d1745afabdda0e426e6e72b.json
[SUCCESS] ✅ Finished /aws/lambda/playerDataProcessor-staging: 4147 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/playerDataProcessor-staging
[INFO] 
--- /aws/lambda/s3ManagementFunction-staging ---
[INFO] Starting backup for: /aws/lambda/s3ManagementFunction-staging
[SUCCESS] ✅   └─ Saved 9 events → logbackup_20251225_081504/_aws_lambda_s3ManagementFunction-staging/251224-115053_251224-115055__2025_12_24___LATEST_332b6a9d6faf40f8ad8cb[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251225_081504/_aws_lambda_playerDataProcessor-staging/251224-115055_251224-115055__2025_12_24___LATEST_d15e5e0e5d1745afabdda0e426e6e72b.json
[SUCCESS] ✅ Finished /aws/lambda/playerDataProcessor-staging: 4147 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/playerDataProcessor-staging
[INFO] 
--- /aws/lambda/s3ManagementFunction-staging ---
[INFO] Starting backup for: /aws/lambda/s3ManagementFunction-staging
[SUCCESS] ✅   └─ Saved 9 events → logbackup_20251225_081504/_aws_lambda_s3ManagementFunction-staging/251224-115053_251224-115055__2025_12_24___LATEST_332b6a9d6faf40f8ad8cb6325d85add0.json
[SUCCESS] ✅   └─ Saved 9 events → logbackup_20251225_081504/_aws_lambda_s3ManagementFunction-staging/251224-115053_251224-115055__2025_12_24___LATEST_a7f04019dc75422ba9047edde64ee3a1.json
[SUCCESS] ✅ Finished /aws/lambda/s3ManagementFunction-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/s3ManagementFunction-staging
[INFO] 
--perManagement-staging/251224-115029_251224-115126__2025_12_24___LATEST_51f081322b5441f5b99b46865993cef5.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_081504/_aws_lambda_scraperManagement-staging/251224-115011_251224-115126__2025_12_24___LATEST_70028e26de0e480da2d2d86bc0e3a526.json
[SUCCESS] ✅   └─ Saved 22 events → logbackup_20251225_081504/_aws_lambda_scraperManagement-staging/251224-200015_251224-200319__2025_12_24___LATEST_82ae5305fc52423997b3b296ee7f42de.json
[SUCCESS] ✅   └─ Saved 66 events → logbackup_20251225_081504/_aws_lambda_scraperManagement-staging/251224-114329_251224-114400__2025_12_24___LATEST_bf17e8a1f32b484396b7b9982e0fb1ba.json
[SUCCESS] ✅   └─ Saved 65 events → logbackup_20251225_081504/_aws_lambda_scraperManagement-staging/251224-114330_251224-115102__2025_12_24___LATEST_d930e5e97f47409a8b5fac80452e7886.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 215 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 16 events → logbackup_20251225_081504/_aws_lambda_tournamentConsolidator-staging/251224-211500_251224-211501__2025_12_24___LATEST_4ced3227e298444992adfc5503591f1d.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_081504/_aws_lambda_tournamentConsolidator-staging/251224-114354_251224-114359__2025_12_24___LATEST_89e39948f0e74bbd886e6fb3a8177481.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251225_081504/_aws_lambda_tournamentConsolidator-staging/251224-211501_251224-211501__2025_12_24___LATEST_8b0766b4b33a4817951c6f34955104c9.json
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251225_081504/_aws_lambda_tournamentConsolidator-staging/251224-211501_251224-211501__2025_12_24___LATEST_f398aa1a40d74376a49a18f67849d182.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 181 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-114356_251224-114400__2025_12_24___LATEST_3598921f68ca47f185693becafed4f85.json
[SUCCESS] ✅   └─ Saved 60 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211502__2025_12_24___LATEST_44f96bd154c6437bbccac04b9aadf479.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211503__2025_12_24___LATEST_578aecd21cf0491b961f71d81b09dbe9.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211502__2025_12_24___LATEST_83861157fbc04235bd6ba25f7dcfa748.json
[SUCCESS] ✅   └�EST_3598921f68ca47f185693becafed4f85.json
[SUCCESS] ✅   └─ Saved 60 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211502__2025_12_24___LATEST_44f96bd154c6437bbccac04b9aadf479.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211503__2025_12_24___LATEST_578aecd21cf0491b961f71d81b09dbe9.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-211500_251224-211502__2025_12_24___LATEST_83861157fbc04235bd6ba25f7dcfa748.json
[SUCCESS] ✅   └─ Saved 113 events → logbackup_20251225_081504/_aws_lambda_venueDetailsUpdater-staging/251224-114354_251224-114358__2025_12_24___LATEST_f7de05ba4fa448278c1b5595a7e4c2c2.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 580 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 146 events → logbackup_20251225_081504/_aws_lambda_webScraperFunction-staging/251224-114347_251224-114359__2025_12_24___LATEST_7992d5f8ec984b8bbc52d7455089cba3.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 146 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCES./run_cleanup_sequence.sh --auto[?1l>[?2004l
]2;./run_cleanup_sequence.sh --auto]1;./run_cleanup_sequence.sh
======================================================================
   ⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️
======================================================================

The script will automatically pipe confirmation keywords.

======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- A
======================================================================
   STEP 1/4: Backup DynamoDB Tables (CSV)
======================================================================

[INFO] --- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---
[INFO] This script will discover tables dynamically and back them up.
[WARN] ⚠️  This performs full table scans and may incur RCU costs.
[INFO] Region: ap-southeast-2
[INFO] Filters: ENV_SUFFIX="staging", API_ID_FILTER="fosb7ek5argnhctz4odpt52eia", TABLE_PREFIX_FILTER="(none)"

This script will back up all data from the following 51 tables:
- AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging
- Asset-fosb7ek5argnhctz4odpt52eia-staging
- BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
- CashStructure-fosb7ek5argnhctz4odpt52eia-staging
- DataSync-fosb7ek5argnhctz4odpt52eia-staging
- Entity-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
- GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- KnownPlayerIdentity-fosb7ek5argnhctz4odpt52eia-staging
- MarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- S3Storage-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
- ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
- ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
- ScraperState-fosb7ek5argnhctz4odpt52eia-staging
- SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
- SocialPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
- SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
- Staff-fosb7ek5argnhctz4odpt52eia-staging
- TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
- TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
- TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
- User-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odgnhctz4odpt52eia-staging → dbbackup_20251225_101753/AmplifyDataStore-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Asset-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Asset-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhoundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table BackgroundTask-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: CashStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table CashStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: DataSync-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table DataSync-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Entity-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from Entity-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/Entity-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from Game-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/Game-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1 items from GameCost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/GameCost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table GameCostLineItem-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1 items from GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ SavgMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 8 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 8 items from Player-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 8 items from PlayerEntry-fosb7ek5argnhctz dbbackup_20251225_101753/Player-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 8 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 8 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 8 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 8 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 16 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 16 items from Playata from table: RakeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RakeStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGame-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[Inhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 13 items from RecurringGame-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: S3Storage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 1107 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[INFO] Scanned 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1739 items from S3Storage-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/S3Storage-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 9 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 9 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScraperJob-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table ScraperState-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialAccount-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 18 items from SocialAccount-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 18 items froSocialPost-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 1801 items from SocialPost-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/SocialPost-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to bacaging
[INFO] Table SocialScheduledPost-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 113 items from SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/SocialScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Staff-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table Staff-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TicketTemplate-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentLevelData-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 3 items from TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 7 items from TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table TournamentStructure-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: User-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 3 items fb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: UserPreference-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table UserPreference-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[INFO] 
Processing table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: Venue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
ProcessingFO] Scanned 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 37 items from Venue-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/Venue-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Scanned 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Saved 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging → dbbackup_20251225_101753/VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.csv
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to back up all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Table VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging is empty. No backup file created.
[SUCCESS] ✅ 
All matched tables have been processed.
[SUCCESS] ✅ Backup data is located in: ./dbbackup_20251225_101753

======================================================================
   STEP 2/4: Clear DynamoDB Data
======================================================================

[WARN] ⚠️  --- KINGSROOM DEV DATABASE CLEARER ---
[WARN] ⚠️  This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.
[WARN] ⚠️  The table structures will remain, but they will be empty.
[WARN] ⚠️  This action is IRREVERSIBLE. Please be absolutely sure.

This script will clear all data from the following tables:
- Game-fosb7ek5argnhctz4odpt52eia-staging
- GameCost-fosb7ek5argnhctz4odpt52eia-staging
- GameFinancialSnapshot-fosb7ek5argnhctz4odpt52eia-staging
- Player-fosb7ek5argnhctz4odpt52eia-staging
- PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
- PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
- PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
- PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
- PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
- PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
- PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
- PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
- UserAuditLog-fosb7ek5argnhctz4odpt52eia-staging
- VenueDetails-fosb7ek5argnhctz4odpt52eia-staging
- EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
- RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
- VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
- TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
Processing table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Game-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 1 items from Game-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 1 items from Game-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: GameCost-fosb7ek5argnz4odpt52eia-staging.
[INFO] 
Processing table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: Player-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from Player-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from Player-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt5fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerCredits-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from PlayerEntry-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingMessage-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerMarketingPreferences-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerPoints-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerResult-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from PlayerResult-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 8 items from PlayerSummary-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from PlayerTicket-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 16 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 16 items from PlayerTransaction-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: PlayerVenue-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Deleted 8 items from PlayerVenue-fosb7e
[INFO] Deleted 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging...
[SUCCESS] ✅ Successfully deleted all 2 items from VenueDetails-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processinall 0 items from EntityMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from RecurringGameMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from VenueMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[INFO] 
Processing table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Starting to clear all data from table: TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging
[SUCCESS] ✅ Successfully deleted all 0 items from TournamentSeriesMetrics-fosb7ek5argnhctz4odpt52eia-staging.
[SUCCESS] ✅ 
All specified tables have been processed.

======================================================================
   STEP 3/4: Clear Scraper Metadata
======================================================================


============================================================
  CLEAR SCRAPER METADATA TABLES
  (S3Storage will be PRESERVED)
============================================================

[WARN] ⚠️  LIVE MODE - Data WILL be permanently deleted!

Tables to CLEAR:
  ❌ ScrapeAttempt
  ❌ ScraperJob
  ❌ ScraperState
  ❌ ScrapeStructure
  ❌ ScrapeURL

Tables PRESERVED:
  ✅ S3Storage (HTML cache references)

------------------------------------------------------------
Checking item counts...

  ScrapeAttempt: 9 items
  ScraperJob: 0 items
  ScraperState: 0 items
  ScrapeStructure: 2 items
  ScrapeURL: 2 items

  TOTAL: 13 items to delete

------------------------------------------------------------
[1G[0J
Type "DELETE" to confirm deletion: [36GDELETE

------------------------------------------------------------
Clearing tables...

[INFO] Clearing table: ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 9 items...
[SUCCESS] ✅ Cleared 9 items from ScrapeAttempt-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperJob-fosb7ek5argnhctz4odpt52eia-staging

[SUCCESS] ✅ Cleared 0 items from ScraperJob-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScraperState-fosb7ek5argnhctz4odpt52eia-staging

[SUCCESS] ✅ Cleared 0 items from ScraperState-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeStructure-fosb7ek5argnhctz4odpt52eia-staging
[INFO] Clearing table: ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging
  Deleted 2 items...
[SUCCESS] ✅ Cleared 2 items from ScrapeURL-fosb7ek5argnhctz4odpt52eia-staging

============================================================
[SUCCESS] ✅ Deleted 13 items total.
[SUCCESS] ✅    | STREAMS
------------------------------------------------------------
 ...bda/entityVenueDashMetricCounter-staging   | 4
 /aws/lambda/gameDataEnricher-staging          | 5
 /aws/lambda/gameFinancialsProcessor-staging   | 2
 /aws/lambda/gameIdTracker-staging             | 11
 /aws/lambda/getDatabaseMetrics-staging        | 2
 /aws/lambda/getModelCount-staging             | 2
 /aws/lambda/playerDataProcessor-staging       | 1
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 10
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 2
 /aws/lambda/webScraperFunction-staging        | 5
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_101801/_aws_lambda_entws/lambda/playerDataProcessor-staging       | 1
 /aws/lambda/saveGameFunction-staging          | 1
 /aws/lambda/scraperManagement-staging         | 10
 /aws/lambda/tournamentConsolidator-staging    | 5
 /aws/lambda/venueDetailsUpdater-staging       | 2
 /aws/lambda/webScraperFunction-staging        | 5
------------------------------------------------------------

[1G[0J
Type "proceed" to continue: [29Gproceed
[INFO] 
--- /aws/lambda/entityVenueDashMetricCounter-staging ---
[INFO] Starting backup for: /aws/lambda/entityVenueDashMetricCounter-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_101801/_aws_lambda_entityVenueDashMetricCounter-staging/251224-211500_251224-211502__2025_12_24___LATEST_0fc77ec7920f46c5817a3beb0baf874e.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251225_101801/_aws_lambda_entityVenueDashMetricCounter-staging/251224-230619_251224-230621__2025_12_24___LATEST_1021904658e04d099d5f1230a10c57e7.json
[SUCCESS] ✅   └─ Saved 5 events → logbackup_20251225_101801/_aws_lambda_entityVenueDashMetricCounter-staging/251224-211502_251224-211502__2025_12_24___LATEST_76ced286b61c4ed599a9c96b5ee38f4a.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_101801/_aws_lambda_entityVenueDashMetricCounter-staging/251224-211500_251224-211502__2025_12_24___LATEST_dcbaabdc82e747f98e1e01f0f9b22af8.json
[SUCCESS] ✅ Finished /aws/lambda/entityVenueDashMetricCounter-staging: 59 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/entityVenueDashMetricCounter-staging
[INFO] 
--- /aws/lambda/gameDataEnricher-staging ---
[INFO] Starting backup for: /aws/lambda/gameDataEnricher-staging
[SUCCESS] ✅   └─ Saved 63 events → logbackup_20251225_101801/_aws_lambda_gameDataEnricher-staging/251224-230613_251224-230614__2025_12_24___LATEST_1a63aefbcb9b48a6bea10d6650afcc96.json
[SUCCESS] ✅   └─ Saved 8 events → logbackup_20251225_101801/_aws_lambda_gameDataEnricher-staging/251224-220001_251224-220001__2025_12_24___LATEST_2df607f9a99c4f2682299ee7ed53f49f.json
[SUCCESS] ✅   └─ Saved 26 events → logbackup_20251225_101801/_aws_lambda_gameDataEnricher-staging/251224-220856_251224-220858__2025_12_24___LATEST_30c362b71a2f41b3a6ad767ae0256905.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_gameDataEnricher-staging/251224-213019_251224-213021__2025_12_24___LATEST_db1c18cb2ba548e3ab7a22c82251fa0b.json
[SUCCESS] ✅   └─ Saved 111 events → logbackup_20251225_101801/_aws_lambda_gameDataEnricher-staging/251224-224813_251224-225015__2025_12_24___LATEST_dec74fc916494e81bd7ec784b5d1481f.json
[SUCCESS] ✅ Finished /aws/lambda/gameDataEnricher-staging: 239 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameDataEnricher-staging
[INFO] 
--- /aws/lambda/gameFinancialsProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/gameFinancialsProcessor-staging
[SUCCESS] ✅   └─ Saved 9 events → logbackup_20251225_101801/_aws_lambda_gameFinancialsProcessor-staging/25aging/251224-212945_251224-213008__2025_12_24___LATEST_2bc9e90e00af40c68adc717b301ee815.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-230527_251224-230602__2025_12_24___LATEST_2c343b6d93d8401692a9a40b8ab077b7.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-215912_251224-215914__2025_12_24___LATEST_367a8af0ce504682be2f7d87fb314c70.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-215912_251224-215914__2025_12_24___LATEST_4ab24774fff549a2ab77208d139eb79d.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-212945_251224-213009__2025_12_24___LATEST_8f249c18ce844f2bb979501eccbf9a47.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-222655_251224-222658__2025_12_24___LATEST_a589c72755a34f6aaf3557cef0f021b1.json24-215912_251224-215914__2025_12_24___LATEST_367a8af0ce504682be2f7d87fb314c70.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-215912_251224-215914__2025_12_24___LATEST_4ab24774fff549a2ab77208d139eb79d.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-212945_251224-213009__2025_12_24___LATEST_8f249c18ce844f2bb979501eccbf9a47.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-222655_251224-222658__2025_12_24___LATEST_a589c72755a34f6aaf3557cef0f021b1.json
[SUCCESS] ✅   └─ Saved 64 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/25122[SUCCESS] ✅   └─ Saved 37 events → logbackup_20251225_101801/_aws_lambda_gameIdTracker-staging/251224-215912_251224-220849__2025_12_24___LATEST_f907b8e3e7bb4220a9b37bfddfe65600.json
[SUCCESS] ✅ Finished /aws/lambda/gameIdTracker-staging: 302 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/gameIdTracker-staging
[INFO] 
--- /aws/lambda/getDatabaseMetrics-staging ---
[INFO] Starting backup for: /aws/lambda/getDatabaseMetrics-staging
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251225_101801/_aws_lambda_getDatabaseMetrics-staging/251224-230627_251224-230628__2025_12_24___LATEST_6070267169214e63a3412ae13d1fbdb9.json
[SUCCESS] ✅   └─ Saved 12 events → logbackup_20251225_101801/_aws_lambda_getDatabaseMetrics-staging/251224-230627_251224-230635__2025_12_24___LATEST_a6bda10f2a86434498fe5ac9c62b4638.json
[SUCCESS] ✅ Finished /aws/lambda/getDatabaseMetrics-staging: 24 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getDatabaseMetrics-staging
[INFO] 
--- /aws/lambda/getModelCount-staging ---
[INFO] Starting backup for: /aws/lambda/getModelCount-staging
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_101801/_aws_lambda_getModelCount-staging/251224-212917_251224-212920__2025_12_24___LATEST_013cd54efad54d09ad7501ced445c0e6.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_101801/_aws_lambda_getModelCount-staging/251224-212917_251224-212920__2025_12_24___LATEST_5d685b54276c43d79364fbe79edaa5b7.json
[SUCCESS] ✅ Finished /aws/lambda/getModelCount-staging: 38 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/getModelCount-staging
[INFO] 
--- /aws/lambda/playerDataProcessor-staging ---
[INFO] Starting backup for: /aws/lambda/playerDataProcessor-staging
[SUCCESS] ✅   └─ Saved 209 events → logbackup_20251225_101801/_aws_lambda_playerDataProcessor-staging/251224-230619_251224-230623__2025_12_24___LATEST_bed36282071945638f95ad7cace480ab.json
[SUCCESS] ✅ Finished /aws/lambda/playerDataProcessor-staging: 209 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/playerDataProcessor-staging
[INFO] 
--- /aws/lambda/saveGameFunction-staging ---
[INFO] Starting backup for: /aws/lambda/saveGameFunction-staging
[SUCCESS] ✅   └─ Saved 18 events → logbackup_20251225_101801/_aws_lambda_saveGameFunction-staging/251224-230617_251224-230619__2025_12_24___LATEST_7aff940e9c264fa1b58b0a79c3d8a795.json
[SUCCESS] ✅ Finished /aws/lambda/saveGameFunction-staging: 18 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/saveGameFunction-staging
[INFO] 
--- /aws/lambda/scraperManagement-staging ---
[INFO] Starting backup for: /aws/lambda/scraperManagement-staging
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-224714_251224-224722__2025_12_24___LATEST_16ef2eb203e94638a0acf07a60e12860.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-224714_251224-224722__2025_12_24___LATEST_1d3a197628194cbdab482c58625cc06d.json
[SUCCESS] ✅   └─ Saved 19 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-215909_251224-215912__2025_12_24___LATEST_1daeefa7e22f49a1ba4d1672787afb03.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-215909_251224-220844__2025_12_24___LATEST_2c853a782a224b13864078df17215e77.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-230527_251224-230529__2025_12_24___LATEST_2da8870f7fbb4e1cbc4dcbb1f52e010c.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-220842_251224-220849__2025_12_24___LATEST_921cca3036204ba78e4adc282f3ee682.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_a[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-215909_251224-220844__2025_12_24___LATEST_2c853a782a2ogbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-222656_251224-222657__2025_12_24___LATEST_c27d834735104800be5fc32c4a3bb90f.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-212942_251224-213009__2025_12_24___LATEST_f45bfd3c6b8a4b5997cf80a71604e8ee.json
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_scraperManagement-staging/251224-230452_251224-230454__2025_12_24___LATEST_f91620ff3dcb4d40bd1493c22c3bb5ac.json
[SUCCESS] ✅ Finished /aws/lambda/scraperManagement-staging: 220 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/scraperManagement-staging
[INFO] 
--- /aws/lambda/tournamentConsolidator-staging ---
[INFO] Starting backup for: /aws/lambda/tournamentConsolidator-staging
[SUCCESS] ✅   └─ Saved 6 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-231758_251224-231758__2025_12_24___LATEST_0c9bd929527a4911800f2b29322cb41c.json
[SUCCESS] ✅   └─ Saved 25 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-224816_251224-224816__2025_12_24___LATEST_2647e283fe134cb69e7f7ed638e36700.json
[SUCCESS] ✅   └─ Saved 13 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-220900_251224-220925__2025_12_24___LATEST_30a751323bdd444fa79334b7f2507384.json
[SUCCESS] ✅   └─ Saved 7 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-220002_251224-220003__2025_12_24___LATEST_4078cf1ed8554039ae2cf631ce98daa4.json
[SUCCESS] ✅   └─ Saved 7 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-230619_251224-230619__2025_12_24___LATEST_b5077b4ede954e98b384bed1b72e5d7c.json
[SUCCESS] ✅   └─ Saved 7 events → logbackup_20251225_101801/_aws_lambda_tournamentConsolidator-staging/251224-213023_251224-213023__2025_12_24___LATEST_c0ab5977975947d196eee9781a527857.json
[SUCCESS] ✅ Finished /aws/lambda/tournamentConsolidator-staging: 65 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/tournamentConsolidator-staging
[INFO] 
--- /aws/lambda/venueDetailsUpdater-staging ---
[INFO] Starting backup for: /aws/lambda/venueDetailsUpdater-staging
[SUCCESS] ✅   └─ Saved 1 events → logbackup_20251225_101801/_aws_lambda_venueDetailsUpdater-staging/251224-212147_251224-212147__2025_12_24___LATEST_424b7ce3da544bf49994dc3ab1447ce4.json
[SUCCESS] ✅   └─ Saved 61 events → logbackup_20251225_101801/_aws_lambda_venueDetailsUpdater-staging/251224-230619_251224-230621__2025_12_24___LATEST_72cc650720d64419a96db9e3b87428f6.json
[SUCCESS] ✅   └─ Saved 55 events → logbackup_20251225_101801/_aws_lambda_venueDetailsUpdater-staging/251224-231758_251224-231800__2025_12_24___LATEST_d5af2cf294c546238a305467a33b0ec4.json
[SUCCESS] ✅ Finished /aws/lambda/venueDetailsUpdater-staging: 117 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/venueDetailsUpdater-staging
[INFO] 
--- /aws/lambda/webScraperFunction-staging ---
[INFO] Starting backup for: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅   └─ Saved 31 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-220854_251224-221440__2025_12_24___LATEST_1a784ac62f4f4fa29069b60cbdd989c7.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-215959_251224-220001__2025_12_24___LATEST_1cef5f313d43402884ce8b62d077ab9e.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-230611_251224-230613__2025_12_24___LATEST_67895b0a3cc44810a8162b0fcf06331f.json
[SUCCESS] ✅   └─ Saved 95 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-224811_251224-225142__2025_12_24___LATEST_994fb6975a5441128f/251224-220854_251224-221440__2025_12_24___LATEST_1a784ac62f4f4fa29069b60cbdd989c7.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-215959_251224-220001__2025_12_24___LATEST_1cef5f313d43402884ce8b62d077ab9e.json
[SUCCESS] ✅   └─ Saved 23 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-230611_251224-230613__2025_12_24___LATEST_67895b0a3cc44810a8162b0fcf06331f.json
[SUCCESS] ✅   └─ Saved 95 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-224811_251224-225142__2025_12_24___LATEST_994fb6975a5441128fe87f67fbd48569.json
[SUCCESS] ✅   └─ Saved 30 events → logbackup_20251225_101801/_aws_lambda_webScraperFunction-staging/251224-213017_251224-213018__2025_12_24___LATEST_a2a4633a53a44f10a37499731a546617.json
[SUCCESS] ✅ Finished /aws/lambda/webScraperFunction-staging: 202 events.
[SUCCESS] ✅ Deleted log group: /aws/lambda/webScraperFunction-staging
[SUCCESS] ✅ Done.

======================================================================
   ✅ SEQUENCE COMPLETE
======================================================================

All scripts executed successfully.
[1m[7m%[27m[1m[0m                                                                                ]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts]2;hoganho@Hogans-MacBook-Pro-5]1;..sroom/scripts]7;file://Hogans-MacBook-Pro-5.local/Users/hoganho/Development/kingsroom/scripts\[0m[27m[24m[J[01;32m➜  [36mscripts[00m [01;34mgit:([31mmain[34m) [33m✗[00m [K[?1h=[?2004h