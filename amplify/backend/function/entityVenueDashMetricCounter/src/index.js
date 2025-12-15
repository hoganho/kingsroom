/*
  Lambda: entityVenueDashMetricCounter
  Region: ap-southeast-2
  
  VERSION: 1.1.0
  
  CHANGELOG:
  - v1.1.0: Added series game exclusion logic
    - Games with isSeries=true are excluded from gameCount
    - Added separate seriesGameCount for tracking series games
    - MODIFY events now handle transitions (regular ↔ series)
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

// ===================================================================
// SERIES DETECTION HELPER
// ===================================================================

/**
 * Determine if a game is part of a tournament series
 * Matches logic in gameFinancialsProcessor
 * @param {Object} game - Game data
 * @returns {boolean}
 */
function isSeriesGame(game) {
  if (!game) return false;
  return !!(game.isSeries === true || game.tournamentSeriesId);
}

// ===================================================================
// HANDLER: GAME CHANGES
// ===================================================================
// Triggers when a Game is ADDED, MODIFIED, or REMOVED
// Now excludes series games from the main gameCount

async function handleGameChange(record) {
  const { eventName, dynamodb } = record;
  const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
  const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;
  const now = new Date().toISOString();

  // Determine series status for old and new images
  const wasSeriesGame = isSeriesGame(oldImage);
  const isNowSeriesGame = isSeriesGame(newImage);

  // 1. GAME ADDED (INSERT)
  if (eventName === 'INSERT') {
    const entityId = newImage.entityId;
    const venueId = newImage.venueId;

    if (isNowSeriesGame) {
      // Series game - increment seriesGameCount only, NOT gameCount
      console.log(`[METRICS] INSERT series game ${newImage.id} - incrementing seriesGameCount only`);
      
      if (entityId) {
        await updateStats(ENTITY_TABLE, entityId, {
          incFields: { seriesGameCount: 1 },
          setDates: { lastSeriesGameAddedAt: now, lastDataRefreshedAt: now }
        });
      }
      if (venueId) {
        await updateStats(VENUE_TABLE, venueId, {
          incFields: { seriesGameCount: 1 },
          setDates: { lastSeriesGameAddedAt: now, lastDataRefreshedAt: now }
        });
      }
    } else {
      // Regular game - increment gameCount
      console.log(`[METRICS] INSERT regular game ${newImage.id} - incrementing gameCount`);
      
      if (entityId) {
        await updateStats(ENTITY_TABLE, entityId, {
          incFields: { gameCount: 1 },
          setDates: { lastGameAddedAt: now, lastDataRefreshedAt: now }
        });
      }
      if (venueId) {
        await updateStats(VENUE_TABLE, venueId, {
          incFields: { gameCount: 1 },
          setDates: { lastGameAddedAt: now, lastDataRefreshedAt: now }
        });
      }
    }
  }

  // 2. GAME MODIFIED (MODIFY)
  // Handle transitions between series and regular games
  if (eventName === 'MODIFY') {
    const entityId = newImage?.entityId || oldImage?.entityId;
    const venueId = newImage?.venueId || oldImage?.venueId;

    // Check if series status changed
    if (wasSeriesGame !== isNowSeriesGame) {
      if (isNowSeriesGame) {
        // Transitioned from regular → series
        // Decrement gameCount, increment seriesGameCount
        console.log(`[METRICS] MODIFY game ${newImage.id} changed regular → series`);
        
        if (entityId) {
          await updateStats(ENTITY_TABLE, entityId, {
            incFields: { gameCount: -1, seriesGameCount: 1 },
            setDates: { lastDataRefreshedAt: now }
          });
        }
        if (venueId) {
          await updateStats(VENUE_TABLE, venueId, {
            incFields: { gameCount: -1, seriesGameCount: 1 },
            setDates: { lastDataRefreshedAt: now }
          });
        }
      } else {
        // Transitioned from series → regular
        // Increment gameCount, decrement seriesGameCount
        console.log(`[METRICS] MODIFY game ${newImage.id} changed series → regular`);
        
        if (entityId) {
          await updateStats(ENTITY_TABLE, entityId, {
            incFields: { gameCount: 1, seriesGameCount: -1 },
            setDates: { lastDataRefreshedAt: now }
          });
        }
        if (venueId) {
          await updateStats(VENUE_TABLE, venueId, {
            incFields: { gameCount: 1, seriesGameCount: -1 },
            setDates: { lastDataRefreshedAt: now }
          });
        }
      }
    }
    // If series status didn't change, no count updates needed
  }

  // 3. GAME REMOVED (REMOVE)
  if (eventName === 'REMOVE') {
    const entityId = oldImage.entityId;
    const venueId = oldImage.venueId;

    if (wasSeriesGame) {
      // Series game removed - decrement seriesGameCount
      console.log(`[METRICS] REMOVE series game ${oldImage.id} - decrementing seriesGameCount`);
      
      if (entityId) {
        await updateStats(ENTITY_TABLE, entityId, { incFields: { seriesGameCount: -1 } });
      }
      if (venueId) {
        await updateStats(VENUE_TABLE, venueId, { incFields: { seriesGameCount: -1 } });
      }
    } else {
      // Regular game removed - decrement gameCount
      console.log(`[METRICS] REMOVE regular game ${oldImage.id} - decrementing gameCount`);
      
      if (entityId) {
        await updateStats(ENTITY_TABLE, entityId, { incFields: { gameCount: -1 } });
      }
      if (venueId) {
        await updateStats(VENUE_TABLE, venueId, { incFields: { gameCount: -1 } });
      }
    }
  }
}

// ===================================================================
// HANDLER: VENUE CHANGES
// ===================================================================
// Triggers when a Venue is ADDED or REMOVED (Updates Entity)

async function handleVenueChange(record) {
  const { eventName, dynamodb } = record;
  const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
  const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;

  if (eventName === 'INSERT' && newImage.entityId) {
    await updateStats(ENTITY_TABLE, newImage.entityId, { incFields: { venueCount: 1 } });
  }

  if (eventName === 'REMOVE' && oldImage.entityId) {
    await updateStats(ENTITY_TABLE, oldImage.entityId, { incFields: { venueCount: -1 } });
  }
}

// ===================================================================
// HELPER: Atomic Updates (Updated to support multiple increment fields)
// ===================================================================

async function updateStats(tableName, id, options) {
  const { incFields, setDates } = options;
  
  // Handle legacy single-field format
  const fieldsToIncrement = incFields || 
    (options.incField ? { [options.incField]: options.incVal } : {});
  
  let updateExp = [];
  const expAttrNames = {};
  const expAttrValues = {};

  // Process all increment fields
  let fieldIdx = 0;
  for (const [field, val] of Object.entries(fieldsToIncrement)) {
    const nameKey = `#cnt${fieldIdx}`;
    const valKey = `:val${fieldIdx}`;
    const startKey = `:start${fieldIdx}`;
    
    // Atomic increment: if field doesn't exist, start at 0 + val
    updateExp.push(`${nameKey} = if_not_exists(${nameKey}, ${startKey}) + ${valKey}`);
    expAttrNames[nameKey] = field;
    expAttrValues[valKey] = val;
    expAttrValues[startKey] = 0;
    fieldIdx++;
  }

  // Process date fields
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