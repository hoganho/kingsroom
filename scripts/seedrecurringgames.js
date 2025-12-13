// seedRecurringGames.js
// Inserts RecurringGame items into DynamoDB (AWS SDK v3).
// Safe-by-default: supports DRY_RUN=1 and uses conditional put (no overwrite).

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const TABLE_NAME =
  process.env.TABLE_NAME || "RecurringGame-sjyzke3u45golhnttlco6bpcua-dev";
const DRY_RUN = process.env.DRY_RUN === "1";

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// ---- Paste your items here ----
const ITEMS = [
  {
    name: "Wenty's Wednesdays $6k-$10k GTD",
    venueId: "0b9c0861-c0ba-4a71-8ffc-8ad410c0c303",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "WEDNESDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 150,
    typicalGuarantee: 10000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "Wenty's Wednesdays $20k GTD",
    venueId: "0b9c0861-c0ba-4a71-8ffc-8ad410c0c303",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "WEDNESDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 350,
    typicalGuarantee: 20000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "Bella Vista Hotel Tuesdays $6k GTD",
    venueId: "6316925d-1163-4b25-8d26-5728a03d99b8",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "TUESDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 150,
    typicalGuarantee: 6000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "Hillside Hotel Monday $4k GTD",
    venueId: "ee247836-4dbd-48a5-b4be-a514fd86eb65",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "MONDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 120,
    typicalGuarantee: 4000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "St.George Leagues Monday Bankroll Builder",
    venueId: "fd4f7fb1-67fd-4398-b4b4-d85722256d45",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "MONDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 120,
    typicalGuarantee: 5000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "St.George Leagues Wednesday PLO4",
    venueId: "fd4f7fb1-67fd-4398-b4b4-d85722256d45",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "WEDNESDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "PLOM",
    typicalBuyIn: 150,
    typicalGuarantee: 5000,
    createdAt: "2025-12-12T07:41:19.874Z",
    updatedAt: "2025-12-12T07:41:19.874Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "St.George Leagues Thursday Grind",
    venueId: "fd4f7fb1-67fd-4398-b4b4-d85722256d45",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "THURSDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 120,
    typicalGuarantee: 5000,
    createdAt: "2025-12-12T07:41:19.872Z",
    updatedAt: "2025-12-12T07:41:19.873Z",
    isActive: true,
    __typename: "RecurringGame",
  },
  {
    name: "St.George Leagues Friday Weekly",
    venueId: "fd4f7fb1-67fd-4398-b4b4-d85722256d45",
    entityId: "42101695-1332-48e3-963b-3c6ad4e909a0",
    dayOfWeek: "FRIDAY",
    frequency: "WEEKLY",
    gameType: "TOURNAMENT",
    gameVariant: "NLHE",
    typicalBuyIn: 150,
    typicalGuarantee: 10000,
    createdAt: "2025-12-12T07:41:19.872Z",
    updatedAt: "2025-12-12T07:41:19.873Z",
    isActive: true,
    __typename: "RecurringGame",
  },
];

function normalizeItem(raw) {
  const nowIso = new Date().toISOString();
  const { __typename, ...rest } = raw;

  return {
    id: rest.id || randomUUID(),
    ...rest,
    createdAt: rest.createdAt || nowIso,
    updatedAt: rest.updatedAt || nowIso,
  };
}

async function main() {
  console.log(`[INFO] Region: ${REGION}`);
  console.log(`[INFO] Table:  ${TABLE_NAME}`);
  console.log(`[INFO] Items:  ${ITEMS.length}`);
  console.log(`[INFO] DRY_RUN=${DRY_RUN ? "1" : "0"}`);

  const normalized = ITEMS.map(normalizeItem);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would write these items:");
    normalized.forEach((it) =>
      console.log(`- id=${it.id} name="${it.name}" venueId=${it.venueId}`)
    );
    return;
  }

  let ok = 0;
  let skipped = 0;

  for (const item of normalized) {
    try {
      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
          // Don't overwrite if the id already exists
          ConditionExpression: "attribute_not_exists(#id)",
          ExpressionAttributeNames: { "#id": "id" },
        })
      );

      ok++;
      console.log(`[SUCCESS] Inserted: ${item.name} (id=${item.id})`);
    } catch (err) {
      // If condition fails, it means the id already exists
      if (err?.name === "ConditionalCheckFailedException") {
        skipped++;
        console.log(`[WARN] Skipped (already exists): id=${item.id} name="${item.name}"`);
        continue;
      }
      console.error(`[ERROR] Failed inserting "${item.name}" (id=${item.id}): ${err?.message || err}`);
      throw err;
    }
  }

  console.log(`\n[SUCCESS] Done. Inserted=${ok} Skipped=${skipped}`);
}

main().catch((e) => {
  console.error("[FATAL] Script failed:", e?.message || e);
  process.exit(1);
});