/*
  Lambda: entityVenueDashMetricCounter
  Region: ap-southeast-2
*/
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

const ENTITY_TABLE = process.env.STORAGE_ENTITY_NAME; 
const VENUE_TABLE = process.env.STORAGE_VENUE_NAME;

export const handler = async (event) => {
  const promises = event.Records.map(async (record) => {
    // Determine source table based on Event Source ARN (Game or Venue table triggered this?)
    const sourceArn = record.eventSourceARN || "";
    const isGameTable = sourceArn.includes("Game");
    const isVenueTable = sourceArn.includes("Venue");

    if (isGameTable) {
      await handleGameChange(record);
    } else if (isVenueTable) {
      await handleVenueChange(record);
    }
  });

  await Promise.all(promises);
};

// --- HANDLER: GAME CHANGES ---
// Triggers when a Game is ADDED or REMOVED
async function handleGameChange(record) {
  const { eventName, dynamodb } = record;
  const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
  const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;
  const now = new Date().toISOString();

  // 1. GAME ADDED (INSERT)
  if (eventName === 'INSERT') {
    const entityId = newImage.entityId;
    const venueId = newImage.venueId;

    // Increment Entity stats
    if (entityId) {
      await updateStats(ENTITY_TABLE, entityId, {
        incField: 'gameCount',
        incVal: 1,
        setDates: { lastGameAddedAt: now, lastDataRefreshedAt: now }
      });
    }
    // Increment Venue stats (Directly on Venue table, not Details)
    if (venueId) {
      await updateStats(VENUE_TABLE, venueId, {
        incField: 'gameCount',
        incVal: 1,
        setDates: { lastGameAddedAt: now, lastDataRefreshedAt: now }
      });
    }
  }

  // 2. GAME REMOVED (REMOVE)
  if (eventName === 'REMOVE') {
    const entityId = oldImage.entityId;
    const venueId = oldImage.venueId;

    if (entityId) {
      await updateStats(ENTITY_TABLE, entityId, { incField: 'gameCount', incVal: -1 });
    }
    if (venueId) {
      await updateStats(VENUE_TABLE, venueId, { incField: 'gameCount', incVal: -1 });
    }
  }
}

// --- HANDLER: VENUE CHANGES ---
// Triggers when a Venue is ADDED or REMOVED (Updates Entity)
async function handleVenueChange(record) {
  const { eventName, dynamodb } = record;
  const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
  const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;

  if (eventName === 'INSERT' && newImage.entityId) {
    await updateStats(ENTITY_TABLE, newImage.entityId, { incField: 'venueCount', incVal: 1 });
  }

  if (eventName === 'REMOVE' && oldImage.entityId) {
    await updateStats(ENTITY_TABLE, oldImage.entityId, { incField: 'venueCount', incVal: -1 });
  }
}

// --- HELPER: Atomic Updates ---
async function updateStats(tableName, id, options) {
  const { incField, incVal, setDates } = options;
  let updateExp = [];
  const expAttrNames = {};
  const expAttrValues = {};

  if (incField) {
    // Atomic increment: if field doesn't exist, start at 0 + val
    updateExp.push(`#cnt = if_not_exists(#cnt, :start) + :val`);
    expAttrNames["#cnt"] = incField;
    expAttrValues[":val"] = incVal;
    expAttrValues[":start"] = 0;
  }

  if (setDates) {
    Object.keys(setDates).forEach((field, idx) => {
      const key = `#d${idx}`;
      const val = `:d${idx}`;
      updateExp.push(`${key} = ${val}`);
      expAttrNames[key] = field;
      expAttrValues[val] = setDates[field];
    });
  }

  if (updateExp.length === 0) return;

  try {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: "SET " + updateExp.join(", "),
      ExpressionAttributeNames: expAttrNames,
      ExpressionAttributeValues: expAttrValues
    }));
  } catch (err) {
    console.error(`Error updating ${tableName} [ID: ${id}]:`, err);
  }
}