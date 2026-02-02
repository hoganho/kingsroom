#!/usr/bin/env node
/**
 * VIP Threshold Calculator (Top 5% by Buy-ins) — per Entity
 *
 * Reads PlayerTransaction records:
 *  - type = BUY_IN
 *  - transactionDate within lookback window (default 12 months)
 *
 * Aggregates per player:
 *  - totalBuyIns
 *  - txnCount
 *
 * Outputs per entity:
 *  - 95th percentile (top 5%) threshold
 *  - VIP count (>= threshold + minTxns guardrail)
 *  - Top N players and VIP list
 *
 * Usage:
 *   node vip-threshold-from-transactions.mjs --entities <id1,id2,id3>
 *   node vip-threshold-from-transactions.mjs --entities <...> --months 12 --minTxns 3 --top 20
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import * as readline from "readline";

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
  console.log("║             VIP THRESHOLD CALCULATOR (TOP 5% BUY-INS)            ║");
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
    entityIds: [],
    months: 12,
    minTxns: 3, // prevents “one huge buy-in once” becoming VIP unless you want it
    top: 20,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--entities":
        options.entityIds = (args[++i] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--months":
        options.months = Number(args[++i] || "12");
        break;
      case "--minTxns":
        options.minTxns = Number(args[++i] || "3");
        break;
      case "--top":
        options.top = Number(args[++i] || "20");
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        console.log(`
VIP Threshold Calculator (Top 5% by Buy-ins) — per Entity

Usage:
  node vip-threshold-from-transactions.mjs --entities <id1,id2,id3> [options]

Options:
  --months <n>     Lookback window in months (default 12)
  --minTxns <n>    Minimum BUY_IN txns to qualify as VIP (default 3)
  --top <n>        Show top N players (default 20)
  --verbose, -v    Extra logging
  --help, -h       Help
`);
        process.exit(0);
      default:
        break;
    }
  }

  return options;
}

function isoMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function percentileNearestRank(valuesSortedAsc, p) {
  // p = 0.95 for 95th percentile
  const n = valuesSortedAsc.length;
  if (n === 0) return null;
  const rank = Math.ceil(p * n);
  const idx = Math.min(Math.max(rank - 1, 0), n - 1);
  return valuesSortedAsc[idx];
}

function getTableName(modelName) {
  return `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;
}

async function fetchAllQuery(docClient, baseParams) {
  const items = [];
  let lastKey = undefined;

  do {
    const resp = await docClient.send(
      new QueryCommand({
        ...baseParams,
        ExclusiveStartKey: lastKey,
      })
    );

    if (resp.Items?.length) items.push(...resp.Items);
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

// =======================
// DynamoDB client
// =======================
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// =======================
// Core per-entity compute
// =======================
async function computeVipForEntity(entityId, options) {
  const tableName = getTableName("PlayerTransaction");
  const startIso = isoMonthsAgo(options.months);
  const endIso = new Date().toISOString();

  if (options.verbose) {
    console.log(`\n[${entityId}] Querying ${tableName} between ${startIso} and ${endIso}`);
  }

  // Assumes a GSI like: byEntityTransaction(entityId, transactionDate)
  // FilterExpression keeps only BUY_IN records.
  const txns = await fetchAllQuery(docClient, {
    TableName: tableName,
    IndexName: "byEntityTransaction",
    KeyConditionExpression: "entityId = :eid AND transactionDate BETWEEN :start AND :end",
    ExpressionAttributeValues: {
      ":eid": entityId,
      ":start": startIso,
      ":end": endIso,
      ":buyin": "BUY_IN",
    },
    ExpressionAttributeNames: { "#t": "type" },
    FilterExpression: "#t = :buyin",
  });

  const byPlayer = new Map(); // playerId -> { totalBuyIns, txnCount }

  for (const t of txns) {
    const playerId = t.playerId;
    if (!playerId) continue;

    const amt = Number(t.amount ?? 0);
    const cur = byPlayer.get(playerId) || { totalBuyIns: 0, txnCount: 0 };
    cur.totalBuyIns += amt;
    cur.txnCount += 1;
    byPlayer.set(playerId, cur);
  }

  const players = Array.from(byPlayer.entries()).map(([playerId, v]) => ({
    playerId,
    totalBuyIns12m: v.totalBuyIns,
    txnCount12m: v.txnCount,
  }));

  if (players.length === 0) {
    return {
      entityId,
      playerCount: 0,
      threshold95: null,
      vipCount: 0,
      topPlayers: [],
      vips: [],
    };
  }

  const totalsAsc = players.map((p) => p.totalBuyIns12m).sort((a, b) => a - b);
  const threshold95 = percentileNearestRank(totalsAsc, 0.95);

  const vips = players
    .filter((p) => p.totalBuyIns12m >= threshold95 && p.txnCount12m >= options.minTxns)
    .sort((a, b) => b.totalBuyIns12m - a.totalBuyIns12m);

  const topPlayers = [...players].sort((a, b) => b.totalBuyIns12m - a.totalBuyIns12m).slice(0, options.top);

  return {
    entityId,
    playerCount: players.length,
    threshold95,
    vipCount: vips.length,
    topPlayers,
    vips,
  };
}

// =======================
// Main
// =======================
async function main() {
  const options = parseArgs(process.argv);

  const env = await selectEnvironment();
  CONFIG = ENVIRONMENTS[env];

  console.log("\n" + "─".repeat(70));
  console.log(`Selected environment: ${env.toUpperCase()}`);
  console.log(`Lookback: last ${options.months} months`);
  console.log(`Min BUY_IN txns for VIP: ${options.minTxns}`);
  console.log("─".repeat(70) + "\n");

  if (!options.entityIds.length) {
    console.log("❗ You must provide --entities <id1,id2,id3>\n");
    process.exit(1);
  }

  for (const entityId of options.entityIds) {
    const r = await computeVipForEntity(entityId, options);

    console.log("=".repeat(70));
    console.log(`ENTITY: ${r.entityId}`);
    console.log("=".repeat(70));
    console.log(`Players w/ BUY_IN txns in window: ${r.playerCount}`);

    if (r.threshold95 === null) {
      console.log("No BUY_IN transactions found in window.\n");
      continue;
    }

    console.log(`95th percentile VIP threshold (total buy-ins): ${r.threshold95.toFixed(2)}`);
    console.log(`VIP count (>= threshold & minTxns): ${r.vipCount}\n`);

    console.log(`Top ${r.topPlayers.length} players by total buy-ins:`);
    console.log("-".repeat(70));
    for (const p of r.topPlayers) {
      console.log(`  ${p.playerId} | buyins=${p.totalBuyIns12m.toFixed(2)} | txns=${p.txnCount12m}`);
    }

    console.log("\nVIP players:");
    console.log("-".repeat(70));
    for (const p of r.vips) {
      console.log(`  ${p.playerId} | buyins=${p.totalBuyIns12m.toFixed(2)} | txns=${p.txnCount12m}`);
    }
    console.log("");
  }

  console.log("✅ Done.\n");
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err);
  process.exit(1);
});