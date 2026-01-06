/*
  Lambda: entityVenueDashMetricCounter
  Region: ap-southeast-2
  
  VERSION: 1.3.0
  
  CHANGELOG:
  - v1.3.0: Added content hash check to skip non-meaningful Game table changes
            Only processes records where dataChangedAt changed
  - v1.2.0: Added robust table name resolution (same as refreshAllMetrics)
            Supports both STORAGE_* and API_KINGSROOM_* env var patterns
  - v1.1.0: Added series game exclusion logic
    - Games with isSeries=true are excluded from gameCount
    - Added separate seriesGameCount for tracking series games
    - MODIFY events now handle transitions (regular ↔ series)
    
  NO PLAYER DATA MODIFICATION - Only updates Entity/Venue count fields.
*/
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

// ===================================================================
// ROBUST TABLE NAME RESOLUTION (same as refreshAllMetrics)
// ===================================================================

const getTableName = (modelName) => {
  // Try STORAGE_* pattern first (legacy)
  const storageVarName = `STORAGE_${modelName.toUpperCase()}_NAME`;
  if (process.env[storageVarName]) {
    return process.env[storageVarName];
  }

  // Try API_KINGSROOM_* pattern (Amplify Gen 2)
  const apiVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
  if (process.env[apiVarName]) {
    return process.env[apiVarName];
  }

  // Fallback: construct from API ID and environment
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;

  if (apiId && env) {
    return `${modelName}-${apiId}-${env}`;
  }

  console.error(`[METRICS] Could not resolve table name for ${modelName}. Available env vars:`, 
    Object.keys(process.env).filter(k => k.includes('TABLE') || k.includes('STORAGE') || k.includes('API_')).join(', ')
  );
  return null;
};

const ENTITY_TABLE = getTableName('Entity');
const VENUE_TABLE = getTableName('Venue');

// ===================================================================
// CONTENT HASH CHECK - Skip non-meaningful Game table changes
// ===================================================================

/**
 * Check if this Game table stream record represents a meaningful change.
 * 
 * @param {Object} record - DynamoDB stream record
 * @returns {Object} { shouldProcess: boolean, reason: string }
 */
function shouldProcessGameRecord(record) {
  const { eventName, dynamodb } = record;
  
  // Always process INSERT events (new games)
  if (eventName === 'INSERT') {
    return { shouldProcess: true, reason: 'New game inserted' };
  }
  
  // Always process REMOVE events (game deleted)
  if (eventName === 'REMOVE') {
    return { shouldProcess: true, reason: 'Game removed' };
  }
  
  // For MODIFY events, check if dataChangedAt changed
  if (eventName === 'MODIFY') {
    const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;
    const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
    
    if (!oldImage || !newImage) {
      return { shouldProcess: true, reason: 'Missing image data, processing to be safe' };
    }
    
    // Check if dataChangedAt changed (meaningful change)
    const oldDataChangedAt = oldImage.dataChangedAt;
    const newDataChangedAt = newImage.dataChangedAt;
    
    if (oldDataChangedAt !== newDataChangedAt) {
      return { shouldProcess: true, reason: 'dataChangedAt changed (meaningful update)' };
    }
    
    // Also check contentHash as backup
    const oldHash = oldImage.contentHash;
    const newHash = newImage.contentHash;
    
    if (oldHash !== newHash) {
      return { shouldProcess: true, reason: 'contentHash changed' };
    }
    
    // No meaningful change
    return { shouldProcess: false, reason: 'No meaningful change (dataChangedAt unchanged)' };
  }
  
  // Unknown event type - process to be safe
  return { shouldProcess: true, reason: 'Unknown event type' };
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
  console.log('[METRICS] v1.3.0 - With content hash check');
  console.log('[METRICS] Table configuration:', { ENTITY_TABLE, VENUE_TABLE });
  
  // Validate tables are configured
  if (!ENTITY_TABLE || !VENUE_TABLE) {
    console.error('[METRICS] FATAL: Table names not configured. Check Lambda environment variables.');
    return { error: 'Table configuration missing' };
  }

  let processed = 0;
  let skipped = 0;

  const promises = event.Records.map(async (record) => {
    // Determine source table based on Event Source ARN
    const sourceArn = record.eventSourceARN || "";
    const isGameTable = sourceArn.includes("Game");
    const isVenueTable = sourceArn.includes("Venue");

    if (isGameTable) {
      // ═══════════════════════════════════════════════════════════════
      // CONTENT HASH CHECK: Skip non-meaningful Game table changes
      // ═══════════════════════════════════════════════════════════════
      const processCheck = shouldProcessGameRecord(record);
      
      if (!processCheck.shouldProcess) {
        console.log(`[METRICS] Skipping Game record: ${processCheck.reason}`);
        skipped++;
        return;
      }
      
      await handleGameChange(record);
      processed++;
    } else if (isVenueTable) {
      // Venue changes don't need content hash check - they're always meaningful
      await handleVenueChange(record);
      processed++;
    }
  });

  await Promise.all(promises);
  
  console.log(`[METRICS] Processing complete: ${processed} processed, ${skipped} skipped`);
  return { processed, skipped };
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
// Excludes series games from the main gameCount

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
    } else {
      console.log(`[METRICS] MODIFY game ${newImage?.id} - series status unchanged, no count updates`);
    }
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
    console.log(`[METRICS] INSERT venue ${newImage.id} - incrementing venueCount for entity ${newImage.entityId}`);
    await updateStats(ENTITY_TABLE, newImage.entityId, { incFields: { venueCount: 1 } });
  }

  if (eventName === 'REMOVE' && oldImage.entityId) {
    console.log(`[METRICS] REMOVE venue ${oldImage.id} - decrementing venueCount for entity ${oldImage.entityId}`);
    await updateStats(ENTITY_TABLE, oldImage.entityId, { incFields: { venueCount: -1 } });
  }
}

// ===================================================================
// HELPER: Atomic Updates (Updated to support multiple increment fields)
// ===================================================================

async function updateStats(tableName, id, options) {
  // Early exit if table name is not configured
  if (!tableName) {
    console.error(`[METRICS] Cannot update stats - table name is undefined for ID: ${id}`);
    return;
  }

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
    console.log(`[METRICS] Updated ${tableName} [ID: ${id}] successfully`);
  } catch (err) {
    console.error(`[METRICS] Error updating ${tableName} [ID: ${id}]:`, err);
  }
}