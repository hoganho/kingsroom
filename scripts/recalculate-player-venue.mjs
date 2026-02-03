#!/usr/bin/env node
/**
 * PlayerVenue Recalculation Script
 *
 * Recalculates ALL PlayerVenue aggregated fields from source data:
 *  - totalGamesPlayed (from PlayerEntry count)
 *  - totalBuyIns (from PlayerTransaction BUY_IN records)
 *  - totalWinnings (from PlayerResult records)
 *  - netProfit (totalWinnings - totalBuyIns)
 *  - averageBuyIn (totalBuyIns / totalGamesPlayed)
 *
 * This is the "nuclear option" for fixing data corrupted by consolidation bugs.
 *
 * Usage:
 *   node recalculate-player-venue.mjs [options]
 *
 * Options:
 *   --venue-id <id>     Filter to specific venue
 *   --player-id <id>    Filter to specific player
 *   --only-negative     Only process records with negative totalGamesPlayed
 *   --export <file>     Export discrepancies to CSV
 *   --apply             Apply fixes (default is dry run)
 *   --verbose, -v       Extra logging
 *   --help, -h          Help
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import * as readline from "readline";
import * as fs from "fs";

// =======================
// ENV (match your style)
// =======================
const ENVIRONMENTS = {
  dev: { API_ID: "ht3nugt6lvddpeeuwj3x6mkite", ENV_SUFFIX: "dev" },
  prod: { API_ID: "ynuahifnznb5zddz727oiqnicy", ENV_SUFFIX: "prod" },
};

const REGION = "ap-southeast-2";
let CONFIG = null;

// =======================
// RCU & Timing Tracking
// =======================
const metrics = {
  startTime: null,
  endTime: null,
  totalRCU: 0,
  scanCount: 0,
  queryCount: 0,
  updateCount: 0,
  // DynamoDB On-Demand pricing for ap-southeast-2 (Sydney)
  // $0.283 per million RRUs (Read Request Units)
  // $1.414 per million WRUs (Write Request Units)
  RCU_PRICE_PER_MILLION: 0.283,
  WCU_PRICE_PER_MILLION: 1.414,
};

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

function trackRCU(consumedCapacity) {
  if (consumedCapacity?.CapacityUnits) {
    metrics.totalRCU += consumedCapacity.CapacityUnits;
  }
}

// =======================
// Helpers
// =======================
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function selectEnvironment() {
  console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║           PLAYERVENUE RECALCULATION SCRIPT                        ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

  console.log("Available environments:\n");
  console.log("  [1] dev");
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}\n`);
  console.log("  [2] prod");
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}\n`);

  const answer = (await askQuestion("Select environment (dev/prod or 1/2): ")).toLowerCase().trim();
  if (answer === "dev" || answer === "1") return "dev";
  if (answer === "prod" || answer === "2") return "prod";

  console.error(`Invalid selection: "${answer}"`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    venueId: null,
    playerId: null,
    onlyNegative: false,
    exportFile: null,
    apply: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--venue-id":
        options.venueId = args[++i] || null;
        break;
      case "--player-id":
        options.playerId = args[++i] || null;
        break;
      case "--only-negative":
        options.onlyNegative = true;
        break;
      case "--export":
        options.exportFile = args[++i] || null;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        console.log(`
PlayerVenue Recalculation Script

Recalculates all aggregated fields from source data to fix corruption.

Usage:
  node recalculate-player-venue.mjs [options]

Options:
  --venue-id <id>     Filter to specific venue
  --player-id <id>    Filter to specific player
  --only-negative     Only process records with negative totalGamesPlayed
  --export <file>     Export discrepancies to CSV
  --apply             Apply fixes (default is dry run)
  --verbose, -v       Extra logging
  --help, -h          Help
`);
        process.exit(0);
      default:
        break;
    }
  }

  return options;
}

function getTableName(modelName) {
  return `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;
}

function formatNumber(num) {
  if (num === null || num === undefined) return "-";
  return typeof num === "number" ? num.toLocaleString() : String(num);
}

function formatMoney(num) {
  if (num === null || num === undefined) return "-";
  const prefix = num < 0 ? "-$" : "$";
  return prefix + Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// =======================
// DynamoDB client
// =======================
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// =======================
// Fetch helpers
// =======================
async function scanAll(tableName, filterExpression, expressionValues, options) {
  const items = [];
  let lastKey = undefined;

  do {
    const params = {
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      ReturnConsumedCapacity: "TOTAL",
    };

    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionValues;
    }

    const result = await docClient.send(new ScanCommand(params));
    if (result.Items?.length) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
    
    // Track RCU consumption
    trackRCU(result.ConsumedCapacity);
    metrics.scanCount++;

    if (options.verbose && items.length % 1000 === 0) {
      process.stdout.write(`\r  Scanned ${items.length} items...`);
    }
  } while (lastKey);

  if (options.verbose) process.stdout.write("\r" + " ".repeat(40) + "\r");
  return items;
}

async function queryAll(tableName, indexName, keyCondition, keyValues, filterExpression, filterValues) {
  const items = [];
  let lastKey = undefined;

  do {
    const params = {
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: { ...keyValues, ...(filterValues || {}) },
      ExclusiveStartKey: lastKey,
      ReturnConsumedCapacity: "TOTAL",
    };

    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }

    const result = await docClient.send(new QueryCommand(params));
    if (result.Items?.length) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
    
    // Track RCU consumption
    trackRCU(result.ConsumedCapacity);
    metrics.queryCount++;
  } while (lastKey);

  return items;
}

async function getById(tableName, id) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: { ":id": id },
      Limit: 1,
      ReturnConsumedCapacity: "TOTAL",
    })
  );
  
  // Track RCU consumption
  trackRCU(result.ConsumedCapacity);
  metrics.queryCount++;
  
  return result.Items?.[0] || null;
}

// =======================
// Recalculation logic
// =======================
async function recalculateStats(playerId, venueId) {
  const playerEntryTable = getTableName("PlayerEntry");
  const playerResultTable = getTableName("PlayerResult");
  const playerTransactionTable = getTableName("PlayerTransaction");

  // 1. Get all PlayerEntry records for this player at this venue
  const entries = await queryAll(
    playerEntryTable,
    "byPlayer",
    "playerId = :pid",
    { ":pid": playerId },
    "venueId = :vid",
    { ":vid": venueId }
  );

  const totalGamesPlayed = entries.length;

  // Get date range from entries
  const dates = entries.map((e) => e.gameStartDateTime).filter(Boolean).sort();
  const firstPlayedDate = dates[0] || null;
  const lastPlayedDate = dates[dates.length - 1] || null;

  // 2. Get unique game IDs
  const gameIds = [...new Set(entries.map((e) => e.gameId))];

  // 3. Calculate totalWinnings from PlayerResult
  let totalWinnings = 0;
  for (const gameId of gameIds) {
    const results = await queryAll(
      playerResultTable,
      "byGame",
      "gameId = :gid",
      { ":gid": gameId },
      "playerId = :pid",
      { ":pid": playerId }
    );
    for (const result of results) {
      totalWinnings += result.amountWon || 0;
    }
  }

  // 4. Calculate totalBuyIns from PlayerTransaction
  let totalBuyIns = 0;
  for (const gameId of gameIds) {
    const txns = await queryAll(
      playerTransactionTable,
      "byGame",
      "gameId = :gid",
      { ":gid": gameId },
      "playerId = :pid",
      { ":pid": playerId }
    );
    for (const txn of txns) {
      if (txn.type === "BUY_IN") {
        totalBuyIns += txn.amount || 0;
      }
    }
  }

  // 5. Calculate derived fields
  const netProfit = totalWinnings - totalBuyIns;
  const averageBuyIn = totalGamesPlayed > 0 ? Math.round((totalBuyIns / totalGamesPlayed) * 100) / 100 : 0;

  return {
    totalGamesPlayed,
    totalBuyIns: Math.round(totalBuyIns * 100) / 100,
    totalWinnings: Math.round(totalWinnings * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    averageBuyIn,
    firstPlayedDate,
    lastPlayedDate,
  };
}

async function getPlayerName(playerId) {
  try {
    const player = await getById(getTableName("Player"), playerId);
    return player ? `${player.firstName} ${player.lastName}`.trim() : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function getVenueName(venueId) {
  try {
    const venue = await getById(getTableName("Venue"), venueId);
    return venue?.name || "Unknown Venue";
  } catch {
    return "Unknown Venue";
  }
}

async function updatePlayerVenue(id, newStats) {
  const now = new Date().toISOString();
  const playerVenueTable = getTableName("PlayerVenue");

  let updateExpr = `SET 
    totalGamesPlayed = :games,
    totalBuyIns = :buyIns,
    totalWinnings = :winnings,
    netProfit = :netProfit,
    averageBuyIn = :avgBuyIn,
    updatedAt = :now,
    #lca = :ts`;

  const values = {
    ":games": newStats.totalGamesPlayed,
    ":buyIns": newStats.totalBuyIns,
    ":winnings": newStats.totalWinnings,
    ":netProfit": newStats.netProfit,
    ":avgBuyIn": newStats.averageBuyIn,
    ":now": now,
    ":ts": Date.now(),
  };

  if (newStats.firstPlayedDate) {
    updateExpr = updateExpr.replace("updatedAt", "firstPlayedDate = :firstPlayed, updatedAt");
    values[":firstPlayed"] = newStats.firstPlayedDate;
  }
  if (newStats.lastPlayedDate) {
    updateExpr = updateExpr.replace("updatedAt", "lastPlayedDate = :lastPlayed, updatedAt");
    values[":lastPlayed"] = newStats.lastPlayedDate;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: playerVenueTable,
      Key: { id },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#lca": "_lastChangedAt" },
      ExpressionAttributeValues: values,
      ReturnConsumedCapacity: "TOTAL",
    })
  );
  
  // Track WCU consumption (stored in same totalRCU for simplicity, but noted separately)
  if (result.ConsumedCapacity?.CapacityUnits) {
    metrics.totalWCU = (metrics.totalWCU || 0) + result.ConsumedCapacity.CapacityUnits;
  }
  metrics.updateCount++;
}

// =======================
// Main
// =======================
async function main() {
  metrics.startTime = Date.now();
  
  const options = parseArgs(process.argv);

  const env = await selectEnvironment();
  CONFIG = ENVIRONMENTS[env];

  console.log("\n" + "─".repeat(70));
  console.log(`Selected environment: ${env.toUpperCase()}`);
  console.log(`Mode: ${options.apply ? "⚠️  APPLY FIXES" : "📋 DRY RUN (report only)"}`);
  if (options.venueId) console.log(`Venue filter: ${options.venueId}`);
  if (options.playerId) console.log(`Player filter: ${options.playerId}`);
  if (options.onlyNegative) console.log(`Filter: Only negative totalGamesPlayed`);
  if (options.exportFile) console.log(`Export CSV to: ${options.exportFile}`);
  console.log("─".repeat(70) + "\n");

  // Step 1: Fetch all PlayerVenue records
  console.log("📊 Step 1: Fetching PlayerVenue records...");

  let filterExpr = null;
  let filterValues = {};

  if (options.onlyNegative) {
    filterExpr = "totalGamesPlayed < :zero";
    filterValues[":zero"] = 0;
  }

  if (options.venueId) {
    filterExpr = filterExpr ? `${filterExpr} AND venueId = :vid` : "venueId = :vid";
    filterValues[":vid"] = options.venueId;
  }

  if (options.playerId) {
    filterExpr = filterExpr ? `${filterExpr} AND playerId = :pid` : "playerId = :pid";
    filterValues[":pid"] = options.playerId;
  }

  const playerVenueTable = getTableName("PlayerVenue");
  const playerVenues = await scanAll(
    playerVenueTable,
    filterExpr,
    Object.keys(filterValues).length > 0 ? filterValues : null,
    options
  );
  console.log(`   Found ${formatNumber(playerVenues.length)} PlayerVenue records\n`);

  if (playerVenues.length === 0) {
    console.log("✅ No PlayerVenue records to process.");
    printMetrics();
    return;
  }

  // Step 2: Recalculate and compare
  console.log("🔍 Step 2: Recalculating stats from source data...");

  const discrepancies = [];
  const correctRecords = [];
  const stats = {
    total: playerVenues.length,
    correct: 0,
    incorrect: 0,
    processed: 0,
  };

  // Cache for names
  const playerNameCache = new Map();
  const venueNameCache = new Map();

  for (const pv of playerVenues) {
    stats.processed++;

    if (stats.processed % 25 === 0 || options.verbose) {
      process.stdout.write(`\r   Processing ${stats.processed}/${stats.total} (${Math.round((stats.processed / stats.total) * 100)}%)...`);
    }

    // Recalculate from source
    const calculated = await recalculateStats(pv.playerId, pv.venueId);

    // Compare with stored values
    const stored = {
      totalGamesPlayed: pv.totalGamesPlayed || 0,
      totalBuyIns: pv.totalBuyIns || 0,
      totalWinnings: pv.totalWinnings || 0,
      netProfit: pv.netProfit || 0,
      averageBuyIn: pv.averageBuyIn || 0,
    };

    // Get names (with caching) - needed for both correct and incorrect
    let playerName = playerNameCache.get(pv.playerId);
    if (!playerName) {
      playerName = await getPlayerName(pv.playerId);
      playerNameCache.set(pv.playerId, playerName);
    }

    let venueName = venueNameCache.get(pv.venueId);
    if (!venueName) {
      venueName = await getVenueName(pv.venueId);
      venueNameCache.set(pv.venueId, venueName);
    }

    const hasDiscrepancy =
      calculated.totalGamesPlayed !== stored.totalGamesPlayed ||
      Math.abs(calculated.totalBuyIns - stored.totalBuyIns) > 0.01 ||
      Math.abs(calculated.totalWinnings - stored.totalWinnings) > 0.01 ||
      Math.abs(calculated.netProfit - stored.netProfit) > 0.01;

    if (hasDiscrepancy) {
      stats.incorrect++;

      discrepancies.push({
        id: pv.id,
        playerId: pv.playerId,
        playerName,
        venueId: pv.venueId,
        venueName,
        entityId: pv.entityId,
        stored,
        calculated,
        gamesDiff: stored.totalGamesPlayed - calculated.totalGamesPlayed,
        buyInsDiff: stored.totalBuyIns - calculated.totalBuyIns,
        winningsDiff: stored.totalWinnings - calculated.totalWinnings,
        netProfitDiff: stored.netProfit - calculated.netProfit,
      });
    } else {
      stats.correct++;
      
      correctRecords.push({
        id: pv.id,
        playerId: pv.playerId,
        playerName,
        venueId: pv.venueId,
        venueName,
        entityId: pv.entityId,
        stored,
        calculated,
      });
    }
  }

  process.stdout.write("\r" + " ".repeat(60) + "\r");

  // Step 3: Report findings
  console.log("\n" + "=".repeat(70));
  console.log("📋 SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total PlayerVenue records scanned: ${formatNumber(stats.total)}`);
  console.log(`Correct (no change needed):        ${formatNumber(stats.correct)} (${((stats.correct / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Incorrect (need fixing):           ${formatNumber(stats.incorrect)} (${((stats.incorrect / stats.total) * 100).toFixed(1)}%)`);
  console.log("=".repeat(70) + "\n");

  if (discrepancies.length === 0) {
    console.log("✅ All PlayerVenue records have correct values!");
    printMetrics();
    return;
  }

  // Sort by games difference (most negative first)
  discrepancies.sort((a, b) => a.gamesDiff - b.gamesDiff);

  // Show detailed discrepancies
  console.log("🔴 DISCREPANCIES (sorted by games difference):");
  console.log("-".repeat(170));
  console.log(
    "PlayerVenue ID".padEnd(40) +
      "Player".padEnd(20) +
      "Venue".padEnd(22) +
      "Games(S→C)".padStart(14) +
      "BuyIns(S→C)".padStart(18) +
      "Winnings(S→C)".padStart(18) +
      "NetProfit(S→C)".padStart(18)
  );
  console.log("-".repeat(170));

  const showCount = Math.min(30, discrepancies.length);
  for (let i = 0; i < showCount; i++) {
    const d = discrepancies[i];
    console.log(
      d.id.substring(0, 39).padEnd(40) +
        d.playerName.substring(0, 19).padEnd(20) +
        d.venueName.substring(0, 21).padEnd(22) +
        `${d.stored.totalGamesPlayed}→${d.calculated.totalGamesPlayed}`.padStart(14) +
        `${formatMoney(d.stored.totalBuyIns)}→${formatMoney(d.calculated.totalBuyIns)}`.padStart(18) +
        `${formatMoney(d.stored.totalWinnings)}→${formatMoney(d.calculated.totalWinnings)}`.padStart(18) +
        `${formatMoney(d.stored.netProfit)}→${formatMoney(d.calculated.netProfit)}`.padStart(18)
    );
  }

  if (discrepancies.length > showCount) {
    console.log(`... and ${discrepancies.length - showCount} more discrepancies`);
  }
  console.log("-".repeat(170) + "\n");
  
  // Show quick summary of correct records in CLI
  if (correctRecords.length > 0) {
    console.log(`✅ CORRECT RECORDS: ${correctRecords.length} records need no changes`);
    console.log("-".repeat(120));
    console.log(
      "PlayerVenue ID".padEnd(40) +
        "Player".padEnd(21) +
        "Venue".padEnd(26) +
        "Games".padStart(10)
    );
    console.log("-".repeat(120));
    const showCorrectCount = Math.min(10, correctRecords.length);
    for (let i = 0; i < showCorrectCount; i++) {
      const c = correctRecords[i];
      console.log(
        c.id.substring(0, 39).padEnd(40) +
          c.playerName.substring(0, 20).padEnd(21) +
          c.venueName.substring(0, 25).padEnd(26) +
          String(c.stored.totalGamesPlayed).padStart(10)
      );
    }
    if (correctRecords.length > showCorrectCount) {
      console.log(`... and ${correctRecords.length - showCorrectCount} more correct records`);
    }
    console.log("-".repeat(120) + "\n");
  }

  // Write full results to a text file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const resultsFile = `playervenue-recalc-results-${timestamp}.txt`;
  
  let reportContent = "";
  reportContent += "=".repeat(170) + "\n";
  reportContent += "PLAYERVENUE RECALCULATION REPORT\n";
  reportContent += `Generated: ${new Date().toISOString()}\n`;
  reportContent += `Environment: ${env.toUpperCase()}\n`;
  reportContent += "=".repeat(170) + "\n\n";
  
  reportContent += "SUMMARY\n";
  reportContent += "-".repeat(170) + "\n";
  reportContent += `Total PlayerVenue records scanned: ${formatNumber(stats.total)}\n`;
  reportContent += `Correct (no change needed):        ${formatNumber(stats.correct)} (${((stats.correct / stats.total) * 100).toFixed(1)}%)\n`;
  reportContent += `Incorrect (need fixing):           ${formatNumber(stats.incorrect)} (${((stats.incorrect / stats.total) * 100).toFixed(1)}%)\n`;
  reportContent += "-".repeat(170) + "\n\n";
  
  reportContent += "ALL DISCREPANCIES (sorted by games difference)\n";
  reportContent += "-".repeat(170) + "\n";
  reportContent += 
    "PlayerVenue ID".padEnd(40) +
    "Player".padEnd(22) +
    "Venue".padEnd(25) +
    "Games(S→C)".padStart(14) +
    "BuyIns(S→C)".padStart(20) +
    "Winnings(S→C)".padStart(20) +
    "NetProfit(S→C)".padStart(20) + "\n";
  reportContent += "-".repeat(170) + "\n";
  
  for (const d of discrepancies) {
    reportContent +=
      d.id.substring(0, 39).padEnd(40) +
      d.playerName.substring(0, 21).padEnd(22) +
      d.venueName.substring(0, 24).padEnd(25) +
      `${d.stored.totalGamesPlayed}→${d.calculated.totalGamesPlayed}`.padStart(14) +
      `${formatMoney(d.stored.totalBuyIns)}→${formatMoney(d.calculated.totalBuyIns)}`.padStart(20) +
      `${formatMoney(d.stored.totalWinnings)}→${formatMoney(d.calculated.totalWinnings)}`.padStart(20) +
      `${formatMoney(d.stored.netProfit)}→${formatMoney(d.calculated.netProfit)}`.padStart(20) + "\n";
  }
  
  reportContent += "-".repeat(170) + "\n\n";
  
  reportContent += "DETAILED RECORDS\n";
  reportContent += "=".repeat(170) + "\n\n";
  
  for (let i = 0; i < discrepancies.length; i++) {
    const d = discrepancies[i];
    reportContent += `[${i + 1}/${discrepancies.length}] ${d.playerName} @ ${d.venueName}\n`;
    reportContent += `    PlayerVenue ID: ${d.id}\n`;
    reportContent += `    Player ID:      ${d.playerId}\n`;
    reportContent += `    Venue ID:       ${d.venueId}\n`;
    reportContent += `    Entity ID:      ${d.entityId || "N/A"}\n`;
    reportContent += `    ┌─────────────────────┬───────────────┬───────────────┬───────────────┐\n`;
    reportContent += `    │ Field               │ Stored        │ Calculated    │ Difference    │\n`;
    reportContent += `    ├─────────────────────┼───────────────┼───────────────┼───────────────┤\n`;
    reportContent += `    │ totalGamesPlayed    │ ${String(d.stored.totalGamesPlayed).padStart(13)} │ ${String(d.calculated.totalGamesPlayed).padStart(13)} │ ${String(d.gamesDiff).padStart(13)} │\n`;
    reportContent += `    │ totalBuyIns         │ ${formatMoney(d.stored.totalBuyIns).padStart(13)} │ ${formatMoney(d.calculated.totalBuyIns).padStart(13)} │ ${formatMoney(d.buyInsDiff).padStart(13)} │\n`;
    reportContent += `    │ totalWinnings       │ ${formatMoney(d.stored.totalWinnings).padStart(13)} │ ${formatMoney(d.calculated.totalWinnings).padStart(13)} │ ${formatMoney(d.winningsDiff).padStart(13)} │\n`;
    reportContent += `    │ netProfit           │ ${formatMoney(d.stored.netProfit).padStart(13)} │ ${formatMoney(d.calculated.netProfit).padStart(13)} │ ${formatMoney(d.netProfitDiff).padStart(13)} │\n`;
    reportContent += `    └─────────────────────┴───────────────┴───────────────┴───────────────┘\n\n`;
  }
  
  // Add correct records section
  reportContent += "\n";
  reportContent += "=".repeat(170) + "\n";
  reportContent += `CORRECT RECORDS (${correctRecords.length} records - no changes needed)\n`;
  reportContent += "=".repeat(170) + "\n\n";
  
  if (correctRecords.length > 0) {
    reportContent += "SUMMARY TABLE\n";
    reportContent += "-".repeat(150) + "\n";
    reportContent += 
      "PlayerVenue ID".padEnd(40) +
      "Player".padEnd(22) +
      "Venue".padEnd(25) +
      "Games".padStart(10) +
      "BuyIns".padStart(15) +
      "Winnings".padStart(15) +
      "NetProfit".padStart(15) + "\n";
    reportContent += "-".repeat(150) + "\n";
    
    for (const c of correctRecords) {
      reportContent +=
        c.id.substring(0, 39).padEnd(40) +
        c.playerName.substring(0, 21).padEnd(22) +
        c.venueName.substring(0, 24).padEnd(25) +
        String(c.stored.totalGamesPlayed).padStart(10) +
        formatMoney(c.stored.totalBuyIns).padStart(15) +
        formatMoney(c.stored.totalWinnings).padStart(15) +
        formatMoney(c.stored.netProfit).padStart(15) + "\n";
    }
    
    reportContent += "-".repeat(150) + "\n\n";
    
    reportContent += "DETAILED CORRECT RECORDS\n";
    reportContent += "-".repeat(150) + "\n\n";
    
    for (let i = 0; i < correctRecords.length; i++) {
      const c = correctRecords[i];
      reportContent += `[${i + 1}/${correctRecords.length}] ${c.playerName} @ ${c.venueName}\n`;
      reportContent += `    PlayerVenue ID: ${c.id}\n`;
      reportContent += `    Player ID:      ${c.playerId}\n`;
      reportContent += `    Venue ID:       ${c.venueId}\n`;
      reportContent += `    Entity ID:      ${c.entityId || "N/A"}\n`;
      reportContent += `    ┌─────────────────────┬───────────────┐\n`;
      reportContent += `    │ Field               │ Value         │\n`;
      reportContent += `    ├─────────────────────┼───────────────┤\n`;
      reportContent += `    │ totalGamesPlayed    │ ${String(c.stored.totalGamesPlayed).padStart(13)} │\n`;
      reportContent += `    │ totalBuyIns         │ ${formatMoney(c.stored.totalBuyIns).padStart(13)} │\n`;
      reportContent += `    │ totalWinnings       │ ${formatMoney(c.stored.totalWinnings).padStart(13)} │\n`;
      reportContent += `    │ netProfit           │ ${formatMoney(c.stored.netProfit).padStart(13)} │\n`;
      reportContent += `    │ averageBuyIn        │ ${formatMoney(c.stored.averageBuyIn).padStart(13)} │\n`;
      reportContent += `    └─────────────────────┴───────────────┘\n\n`;
    }
  } else {
    reportContent += "(No correct records found - all records have discrepancies)\n\n";
  }
  
  fs.writeFileSync(resultsFile, reportContent);
  console.log(`📄 Full results written to: ${resultsFile}`);
  console.log(`   Contains: ${discrepancies.length} discrepancies + ${correctRecords.length} correct records\n`);

  // Export to CSV if requested
  if (options.exportFile) {
    console.log(`📁 Exporting all ${discrepancies.length} discrepancies to ${options.exportFile}...`);

    const csvHeader =
      "PlayerVenueId,PlayerId,PlayerName,VenueId,VenueName,EntityId," +
      "StoredGames,CalculatedGames,GamesDiff," +
      "StoredBuyIns,CalculatedBuyIns,BuyInsDiff," +
      "StoredWinnings,CalculatedWinnings,WinningsDiff," +
      "StoredNetProfit,CalculatedNetProfit,NetProfitDiff\n";

    const csvRows = discrepancies
      .map(
        (d) =>
          `"${d.id}","${d.playerId}","${d.playerName.replace(/"/g, '""')}","${d.venueId}","${d.venueName.replace(/"/g, '""')}","${d.entityId || ""}"` +
          `,${d.stored.totalGamesPlayed},${d.calculated.totalGamesPlayed},${d.gamesDiff}` +
          `,${d.stored.totalBuyIns},${d.calculated.totalBuyIns},${d.buyInsDiff}` +
          `,${d.stored.totalWinnings},${d.calculated.totalWinnings},${d.winningsDiff}` +
          `,${d.stored.netProfit},${d.calculated.netProfit},${d.netProfitDiff}`
      )
      .join("\n");

    fs.writeFileSync(options.exportFile, csvHeader + csvRows);
    console.log(`   ✅ Exported to ${options.exportFile}\n`);
  }

  // Step 4: Apply fixes if requested
  if (!options.apply) {
    console.log("ℹ️  This was a DRY RUN. No changes were made.");
    console.log("   To apply fixes, run with --apply flag\n");
    printMetrics();
    return;
  }

  // Confirm before applying
  console.log("⚠️  APPLY MODE: About to update " + discrepancies.length + " PlayerVenue records.");
  console.log("   This will overwrite: totalGamesPlayed, totalBuyIns, totalWinnings, netProfit, averageBuyIn");
  const answer = await askQuestion("Are you sure you want to proceed? (yes/no): ");

  if (answer !== "yes" && answer !== "y") {
    console.log("❌ Aborted. No changes made.\n");
    printMetrics();
    return;
  }

  console.log("\n🔧 Applying fixes...");

  let updated = 0;
  let errors = 0;

  for (const d of discrepancies) {
    try {
      await updatePlayerVenue(d.id, d.calculated);
      updated++;

      if (updated % 25 === 0) {
        process.stdout.write(`\r   Updated ${updated}/${discrepancies.length}...`);
      }
    } catch (error) {
      errors++;
      console.error(`\n   ❌ Error updating ${d.id}: ${error.message}`);
    }
  }

  process.stdout.write("\r" + " ".repeat(40) + "\r");

  console.log("\n" + "=".repeat(70));
  console.log("✅ COMPLETE");
  console.log("=".repeat(70));
  console.log(`Successfully updated: ${formatNumber(updated)} records`);
  if (errors > 0) console.log(`Errors: ${errors}`);
  
  // Print metrics
  printMetrics();
}

function printMetrics() {
  metrics.endTime = Date.now();
  const duration = metrics.endTime - metrics.startTime;
  
  // Calculate costs
  const readCost = (metrics.totalRCU / 1_000_000) * metrics.RCU_PRICE_PER_MILLION;
  const writeCost = ((metrics.totalWCU || 0) / 1_000_000) * metrics.WCU_PRICE_PER_MILLION;
  const totalCost = readCost + writeCost;
  
  console.log("=".repeat(70));
  console.log("📊 EXECUTION METRICS");
  console.log("=".repeat(70));
  console.log(`Duration:            ${formatDuration(duration)}`);
  console.log(`Scan operations:     ${formatNumber(metrics.scanCount)}`);
  console.log(`Query operations:    ${formatNumber(metrics.queryCount)}`);
  console.log(`Update operations:   ${formatNumber(metrics.updateCount)}`);
  console.log("-".repeat(70));
  console.log(`Total RCUs consumed: ${formatNumber(Math.ceil(metrics.totalRCU))}`);
  console.log(`Total WCUs consumed: ${formatNumber(Math.ceil(metrics.totalWCU || 0))}`);
  console.log("-".repeat(70));
  console.log(`Estimated read cost:  $${readCost.toFixed(4)} USD`);
  console.log(`Estimated write cost: $${writeCost.toFixed(4)} USD`);
  console.log(`Estimated total cost: $${totalCost.toFixed(4)} USD`);
  console.log("=".repeat(70));
  console.log("(Pricing based on ap-southeast-2 On-Demand: $0.283/M RRU, $1.414/M WRU)");
  console.log("=".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err);
  process.exit(1);
});
