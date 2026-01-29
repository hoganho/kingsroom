// backfill-game-duration-fields.mjs
// 
// This script fixes FINISHED games that are missing totalDuration, gameEndDateTime,
// and gameActualStartDateTime due to two bugs:
//
// BUG 1: html-parser.js getTotalDurationEnhanced wasn't being called (old getTotalDuration)
// BUG 2: save-handler.js wasn't passing gameActualStartDateTime to the enricher
//
// This script will:
// 1. Find all Game records where gameStatus=FINISHED but gameEndDateTime is null
// 2. Look up the corresponding S3 cached HTML via ScrapeURL.latestS3Key
// 3. Re-extract timing data from the cached HTML (cw_tt JSON)
// 4. Update the Game record with totalDuration, gameEndDateTime, gameActualStartDateTime
//
// ⚠️ WARNING: This modifies production data. Always backup first!

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
    S3_BUCKET: 'pokerpro-scraper-storage',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
    S3_BUCKET: 'kingsroom-storage-prod',
  },
};

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Output directory for reports
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './backfill-reports';

// Batch size for updates
const UPDATE_BATCH_SIZE = 10;

// Delay between batches to avoid throttling (ms)
const BATCH_DELAY_MS = 500;

// If set to 1, we don't modify data; we just report what would be fixed
const DRY_RUN = process.env.DRY_RUN === '1';

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

let SELECTED_ENV = null;
let config = null;

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  fix: (msg) => console.log(`[FIX] 🔧 ${msg}`),
  skip: (msg) => console.log(`[SKIP] ⏭️  ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENTS
// ------------------------------------------------------------------

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: REGION });

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getTableName(modelName) {
  return `${modelName}-${config.API_ID}-${config.ENV_SUFFIX}`;
}

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Convert CW timestamp to ISO format
 * Handles both string ("2026-01-22 06:00:19") and numeric Unix timestamps
 */
function cwTimestampToISO(cwTimestamp) {
  if (cwTimestamp === null || cwTimestamp === undefined) return null;
  
  try {
    // Handle numeric Unix timestamps (seconds or milliseconds)
    if (typeof cwTimestamp === 'number') {
      if (cwTimestamp <= 0) return null;
      // If > 1e12, it's milliseconds; otherwise seconds
      const ms = cwTimestamp > 1e12 ? cwTimestamp : cwTimestamp * 1000;
      const date = new Date(ms);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    
    // Handle string timestamps: "2026-01-22 16:00:00"
    if (typeof cwTimestamp === 'string') {
      const trimmed = cwTimestamp.trim();
      if (!trimmed) return null;
      
      // Convert "YYYY-MM-DD HH:MM:SS" to ISO format
      const isoStr = trimmed.replace(' ', 'T') + '.000Z';
      const date = new Date(isoStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    
    return null;
  } catch (e) {
    console.warn(`[cwTimestampToISO] Error converting timestamp: ${cwTimestamp}`, e.message);
    return null;
  }
}

/**
 * Extract timing data from HTML content
 * 
 * PRIORITY ORDER for gameEndDateTime:
 * 1. Calculate from start + duration (most accurate for flights/day games)
 * 2. Use finished_utc directly (when duration unavailable)
 * 
 * WHY: The source data's `finished_utc` contains the PARENT tournament's end time
 * for flights/day games, but it's correct for Final Day games where there's no
 * duration data available.
 */
function extractTimingFromHtml(html) {
  const result = {
    totalDuration: null,
    gameActualStartDateTime: null,
    gameEndDateTime: null,
    extracted: false,
    error: null,
    isMultiDay: false,
    endTimeSource: null, // 'calculated' or 'finished_utc'
  };
  
  try {
    // Extract cw_tt JSON from HTML
    const match = html.match(/const cw_tt = ({.*?});/);
    if (!match) {
      result.error = 'cw_tt JSON not found in HTML';
      return result;
    }
    
    const gameData = JSON.parse(match[1]);
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Extract raw values
    // ═══════════════════════════════════════════════════════════════════════
    
    let durationSeconds = null;
    let actualStartIso = null;
    let sourceEndIso = null;
    
    // Duration from ttime (always correct for individual game)
    if (gameData.ttime !== undefined && gameData.ttime > 0) {
      const parsed = parseInt(gameData.ttime, 10);
      if (!isNaN(parsed)) {
        durationSeconds = parsed;
      }
    }
    
    // Start time from started_utc (always correct)
    if (gameData.started_utc) {
      actualStartIso = cwTimestampToISO(gameData.started_utc);
    }
    
    // End time from finished_utc (may be parent's end time for flights)
    if (gameData.finished_utc) {
      sourceEndIso = cwTimestampToISO(gameData.finished_utc);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Store duration and start time
    // ═══════════════════════════════════════════════════════════════════════
    
    result.totalDuration = durationSeconds;
    result.gameActualStartDateTime = actualStartIso;
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Determine gameEndDateTime with smart fallback
    // ═══════════════════════════════════════════════════════════════════════
    
    if (actualStartIso && durationSeconds) {
      // PRIORITY 1: Calculate from start + duration (most accurate for flights)
      const startMs = new Date(actualStartIso).getTime();
      const calculatedEndMs = startMs + (durationSeconds * 1000);
      result.gameEndDateTime = new Date(calculatedEndMs).toISOString();
      result.endTimeSource = 'calculated';
      
      // Check if multi-day (finished_utc differs significantly)
      if (sourceEndIso) {
        const sourceEndMs = new Date(sourceEndIso).getTime();
        const diffHours = Math.abs(sourceEndMs - calculatedEndMs) / (1000 * 60 * 60);
        
        if (diffHours > 1) {
          result.isMultiDay = true;
        }
      }
      
    } else if (sourceEndIso) {
      // PRIORITY 2: Use finished_utc directly (when no duration)
      result.gameEndDateTime = sourceEndIso;
      result.endTimeSource = 'finished_utc';
      
      // Try to calculate duration if we have start time
      if (actualStartIso) {
        const startMs = new Date(actualStartIso).getTime();
        const endMs = new Date(sourceEndIso).getTime();
        
        if (endMs > startMs) {
          result.totalDuration = Math.floor((endMs - startMs) / 1000);
        }
      }
    }
    
    result.extracted = !!(result.totalDuration || result.gameEndDateTime || result.gameActualStartDateTime);
    
  } catch (e) {
    result.error = e.message;
  }
  
  return result;
}

// ------------------------------------------------------------------
// FIND GAMES NEEDING BACKFILL
// ------------------------------------------------------------------

async function findGamesNeedingBackfill() {
  const tableName = getTableName('Game');
  logger.info(`Scanning table: ${tableName}`);
  
  const gamesNeedingFix = [];
  const stats = {
    totalScanned: 0,
    finishedGames: 0,
    missingTiming: 0,
    alreadyComplete: 0,
  };
  
  let lastEvaluatedKey = undefined;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      // Only scan FINISHED games
      FilterExpression: 'gameStatus = :finished',
      ExpressionAttributeValues: {
        ':finished': 'FINISHED'
      },
      ProjectionExpression: 'id, #name, tournamentId, entityId, sourceUrl, gameStatus, gameStartDateTime, gameEndDateTime, gameActualStartDateTime, totalDuration, venueId',
      ExpressionAttributeNames: {
        '#name': 'name'
      }
    };
    
    const result = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = result.Items || [];
    
    stats.totalScanned += items.length;
    
    for (const game of items) {
      stats.finishedGames++;
      
      // Check if missing any timing fields
      const missingEndTime = !game.gameEndDateTime;
      const missingActualStart = !game.gameActualStartDateTime;
      const missingDuration = !game.totalDuration;
      
      if (missingEndTime || missingActualStart || missingDuration) {
        stats.missingTiming++;
        gamesNeedingFix.push({
          id: game.id,
          name: game.name,
          tournamentId: game.tournamentId,
          entityId: game.entityId,
          sourceUrl: game.sourceUrl,
          gameStartDateTime: game.gameStartDateTime,
          venueId: game.venueId,
          current: {
            gameEndDateTime: game.gameEndDateTime,
            gameActualStartDateTime: game.gameActualStartDateTime,
            totalDuration: game.totalDuration,
          },
          missing: {
            gameEndDateTime: missingEndTime,
            gameActualStartDateTime: missingActualStart,
            totalDuration: missingDuration,
          }
        });
      } else {
        stats.alreadyComplete++;
      }
    }
    
    if (stats.totalScanned % 100 === 0) {
      logger.info(`Scanned ${stats.totalScanned} finished games, found ${stats.missingTiming} needing backfill...`);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return { gamesNeedingFix, stats };
}

// ------------------------------------------------------------------
// GET S3 KEY FOR GAME
// ------------------------------------------------------------------

async function getS3KeyForGame(game) {
  // Method 1: Try ScrapeURL by URL
  if (game.sourceUrl) {
    try {
      const scrapeUrlTable = getTableName('ScrapeURL');
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: scrapeUrlTable,
        IndexName: 'byURL',
        KeyConditionExpression: '#url = :url',
        ExpressionAttributeNames: { '#url': 'url' },
        ExpressionAttributeValues: { ':url': game.sourceUrl },
        Limit: 1
      }));
      
      if (result.Items?.[0]?.latestS3Key) {
        return result.Items[0].latestS3Key;
      }
    } catch (e) {
      logger.warn(`ScrapeURL lookup by URL failed: ${e.message}`);
    }
  }
  
  // Method 2: Try ScrapeURL by tournamentId + entityId
  if (game.tournamentId && game.entityId) {
    try {
      const scrapeUrlTable = getTableName('ScrapeURL');
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: scrapeUrlTable,
        IndexName: 'byTournamentId',
        KeyConditionExpression: 'tournamentId = :tid',
        FilterExpression: 'entityId = :eid',
        ExpressionAttributeValues: {
          ':tid': game.tournamentId,
          ':eid': game.entityId
        },
        Limit: 10
      }));
      
      // Find one with S3 key
      const withS3Key = result.Items?.find(item => item.latestS3Key);
      if (withS3Key) {
        return withS3Key.latestS3Key;
      }
    } catch (e) {
      logger.warn(`ScrapeURL lookup by tournamentId failed: ${e.message}`);
    }
  }
  
  return null;
}

// ------------------------------------------------------------------
// FETCH HTML FROM S3
// ------------------------------------------------------------------

async function fetchHtmlFromS3(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: s3Key,
    });
    
    const response = await s3Client.send(command);
    const html = await response.Body.transformToString();
    return html;
  } catch (e) {
    throw new Error(`S3 fetch failed: ${e.message}`);
  }
}

// ------------------------------------------------------------------
// FIX GAME RECORD
// ------------------------------------------------------------------

async function fixGame(game, timing) {
  const tableName = getTableName('Game');
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  // Build update expression dynamically based on what we're fixing
  const updates = {};
  const fieldsUpdated = [];
  
  if (timing.totalDuration && game.missing.totalDuration) {
    updates.totalDuration = timing.totalDuration;
    fieldsUpdated.push('totalDuration');
  }
  
  if (timing.gameEndDateTime && game.missing.gameEndDateTime) {
    updates.gameEndDateTime = timing.gameEndDateTime;
    fieldsUpdated.push('gameEndDateTime');
  }
  
  if (timing.gameActualStartDateTime && game.missing.gameActualStartDateTime) {
    updates.gameActualStartDateTime = timing.gameActualStartDateTime;
    fieldsUpdated.push('gameActualStartDateTime');
  }
  
  if (fieldsUpdated.length === 0) {
    return { success: false, reason: 'No fields to update' };
  }
  
  // Add metadata
  updates.updatedAt = now;
  updates._lastChangedAt = timestamp;
  updates.dataChangedAt = now; // Trigger downstream processors
  
  if (DRY_RUN) {
    return { success: true, dryRun: true, fieldsUpdated };
  }
  
  try {
    const updateExpression = 'SET ' + Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
    const expressionAttributeValues = Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]]));
    
    await ddbDocClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: game.id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }));
    
    return { success: true, fieldsUpdated };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ------------------------------------------------------------------
// PROCESS GAMES IN BATCHES
// ------------------------------------------------------------------

async function processGames(games) {
  const results = {
    fixed: 0,
    failed: 0,
    noS3Key: 0,
    noTimingData: 0,
    errors: [],
    details: [],
  };
  
  for (let i = 0; i < games.length; i += UPDATE_BATCH_SIZE) {
    const batch = games.slice(i, i + UPDATE_BATCH_SIZE);
    
    for (const game of batch) {
      try {
        // Step 1: Get S3 key
        const s3Key = await getS3KeyForGame(game);
        if (!s3Key) {
          results.noS3Key++;
          results.details.push({
            gameId: game.id,
            name: game.name,
            status: 'NO_S3_KEY',
          });
          logger.skip(`${game.name} - No S3 key found`);
          continue;
        }
        
        // Step 2: Fetch HTML from S3
        const html = await fetchHtmlFromS3(s3Key);
        
        // Step 3: Extract timing data
        const timing = extractTimingFromHtml(html);
        if (!timing.extracted) {
          results.noTimingData++;
          results.details.push({
            gameId: game.id,
            name: game.name,
            status: 'NO_TIMING_DATA',
            error: timing.error,
          });
          logger.skip(`${game.name} - No timing data in HTML: ${timing.error}`);
          continue;
        }
        
        // Step 4: Update game record
        const fixResult = await fixGame(game, timing);
        
        if (fixResult.success) {
          results.fixed++;
          results.details.push({
            gameId: game.id,
            name: game.name,
            status: 'FIXED',
            fieldsUpdated: fixResult.fieldsUpdated,
            isMultiDay: timing.isMultiDay || false,
            endTimeSource: timing.endTimeSource || 'unknown',
            timing: {
              totalDuration: timing.totalDuration,
              gameEndDateTime: timing.gameEndDateTime,
              gameActualStartDateTime: timing.gameActualStartDateTime,
            }
          });
          const sourceInfo = timing.endTimeSource === 'calculated' ? '(calc)' : '(finished_utc)';
          const multiDayInfo = timing.isMultiDay ? ' [multi-day]' : '';
          logger.fix(`${game.name} - Updated: ${fixResult.fieldsUpdated.join(', ')} ${sourceInfo}${multiDayInfo}`);
        } else {
          results.failed++;
          results.errors.push({ gameId: game.id, error: fixResult.error || fixResult.reason });
          logger.error(`${game.name} - ${fixResult.error || fixResult.reason}`);
        }
        
      } catch (e) {
        results.failed++;
        results.errors.push({ gameId: game.id, error: e.message });
        logger.error(`${game.name} - ${e.message}`);
      }
    }
    
    // Progress update
    const processed = Math.min(i + UPDATE_BATCH_SIZE, games.length);
    logger.info(`Progress: ${processed}/${games.length} games processed`);
    
    // Delay between batches
    if (i + UPDATE_BATCH_SIZE < games.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  return results;
}

// ------------------------------------------------------------------
// GENERATE REPORT
// ------------------------------------------------------------------

async function generateReport(games, stats, processResults, timestamp) {
  const reportDir = path.join(REPORT_OUTPUT_DIR, `backfill_duration_${config.ENV_SUFFIX}_${timestamp}`);
  await fs.mkdir(reportDir, { recursive: true });
  
  // Summary report
  const summaryPath = path.join(reportDir, 'summary.txt');
  const summaryContent = `
GAME DURATION FIELDS BACKFILL REPORT
====================================
Generated: ${new Date().toISOString()}
Environment: ${SELECTED_ENV.toUpperCase()}
Dry Run: ${DRY_RUN ? 'YES' : 'NO'}

SCAN STATISTICS
---------------
Total finished games scanned: ${stats.finishedGames}
Missing timing fields: ${stats.missingTiming}
Already complete: ${stats.alreadyComplete}

PROCESSING RESULTS
------------------
Successfully fixed: ${processResults.fixed}
Failed to fix: ${processResults.failed}
No S3 key found: ${processResults.noS3Key}
No timing data in HTML: ${processResults.noTimingData}

${processResults.errors.length > 0 ? `
ERRORS
------
${processResults.errors.map(e => `${e.gameId}: ${e.error}`).join('\n')}
` : ''}

WHAT WAS FIXED
--------------
For each game with missing timing data:
- totalDuration: Extracted from cw_tt.ttime (seconds)
- gameActualStartDateTime: Extracted from cw_tt.started_utc
- gameEndDateTime: CALCULATED from gameActualStartDateTime + totalDuration
  (NOT using finished_utc, which contains the parent tournament's end time)

BUG EXPLANATION:
The source data's finished_utc field contains the PARENT tournament's end time
(when the Final Day completed), NOT the individual flight/day's end time.
For example, Flight 1C might show:
  - started_utc: "2026-01-22 06:00:19" (correct)
  - finished_utc: "2026-01-27 04:36:28" (WRONG - this is Final Day, not Flight 1C)
  - ttime: 29551 seconds (~8 hours, correct for Flight 1C)

The fix calculates gameEndDateTime = gameActualStartDateTime + totalDuration
instead of using the incorrect finished_utc value.
`;
  
  await fs.writeFile(summaryPath, summaryContent);
  logger.success(`Summary saved to: ${summaryPath}`);
  
  // Detailed CSV
  if (processResults.details.length > 0) {
    const csvPath = path.join(reportDir, 'processed_games.csv');
    const headers = [
      'gameId', 'name', 'status', 'fieldsUpdated', 'isMultiDay',
      'totalDuration', 'gameEndDateTime', 'gameActualStartDateTime', 'error'
    ];
    
    const rows = processResults.details.map(d => [
      d.gameId,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.status,
      d.fieldsUpdated?.join(';') || '',
      d.isMultiDay || false,
      d.timing?.totalDuration || '',
      d.timing?.gameEndDateTime || '',
      d.timing?.gameActualStartDateTime || '',
      d.error || '',
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    await fs.writeFile(csvPath, csvContent);
    logger.success(`Detailed CSV saved to: ${csvPath}`);
  }
  
  return reportDir;
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        GAME DURATION FIELDS BACKFILL SCRIPT                       ║');
  console.log('║        Fixes missing totalDuration, gameEndDateTime,              ║');
  console.log('║        gameActualStartDateTime from S3 cached HTML                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log(`        S3 Bucket: ${ENVIRONMENTS.dev.S3_BUCKET}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log(`        S3 Bucket: ${ENVIRONMENTS.prod.S3_BUCKET}`);
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
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`S3 Bucket: ${config.S3_BUCKET}`);
  logger.info(`Game table: ${getTableName('Game')}`);
  logger.info(`ScrapeURL table: ${getTableName('ScrapeURL')}`);
  logger.info(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will modify data!)'}`);
  console.log('─'.repeat(70) + '\n');

  // Production safety check
  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    logger.warn('⚠️  You are about to MODIFY PRODUCTION data!');
    logger.warn('⚠️  Make sure you have a recent backup!');
    const confirm = await askQuestion('Type "backfill prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'backfill prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.warn('AWS credentials not found in environment variables.');
    logger.info('Using default credential chain (profile, instance role, etc.)');
  }

  const timestamp = makeTimestamp();

  // Step 1: Find games needing backfill
  logger.info('\n📊 STEP 1: Scanning for FINISHED games missing timing fields...\n');
  const { gamesNeedingFix, stats } = await findGamesNeedingBackfill();
  
  console.log('\n' + '─'.repeat(70));
  logger.info('SCAN RESULTS:');
  logger.info(`  Total finished games: ${stats.finishedGames}`);
  logger.info(`  Missing timing fields: ${stats.missingTiming}`);
  logger.info(`  Already complete: ${stats.alreadyComplete}`);
  console.log('─'.repeat(70) + '\n');

  if (gamesNeedingFix.length === 0) {
    logger.success('No games need backfilling! All timing fields are complete.');
    return;
  }

  // Show sample
  logger.info('Sample of games needing backfill:');
  const sample = gamesNeedingFix.slice(0, 5);
  for (const game of sample) {
    console.log(`\n  📋 ${game.name}`);
    console.log(`     ID: ${game.id}`);
    console.log(`     Date: ${game.gameStartDateTime}`);
    console.log(`     Missing: ${Object.entries(game.missing).filter(([k, v]) => v).map(([k]) => k).join(', ')}`);
  }
  if (gamesNeedingFix.length > 5) {
    console.log(`\n  ... and ${gamesNeedingFix.length - 5} more`);
  }
  console.log('');

  // Confirm before processing
  if (!DRY_RUN) {
    const confirmFix = await askQuestion(`\nProcess ${gamesNeedingFix.length} games? Type "backfill" to continue: `);
    if (confirmFix.toLowerCase().trim() !== 'backfill') {
      logger.info('Aborted by user.');
      return;
    }
  }

  // Step 2: Process games
  logger.info('\n🔧 STEP 2: Processing games (fetching S3, extracting timing, updating)...\n');
  const processResults = await processGames(gamesNeedingFix);

  // Step 3: Generate report
  logger.info('\n📝 STEP 3: Generating report...\n');
  const reportDir = await generateReport(gamesNeedingFix, stats, processResults, timestamp);

  // Final summary
  console.log('\n' + '═'.repeat(70));
  logger.success('BACKFILL COMPLETE!');
  console.log('═'.repeat(70));
  console.log(`
  Games fixed: ${processResults.fixed}
  Games failed: ${processResults.failed}
  No S3 key: ${processResults.noS3Key}
  No timing data: ${processResults.noTimingData}
  
  Report saved to: ${reportDir}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
  `);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
