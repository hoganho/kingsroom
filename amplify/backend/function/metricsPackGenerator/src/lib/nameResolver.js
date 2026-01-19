/**
 * Name Resolver
 * ==============
 * Batch-fetches venue and recurring game names to enrich snapshots.
 * Uses BatchGetCommand for efficient lookups (max 100 items per call).
 * 
 * This solves the "Unknown Venue" / "Unknown Game" problem by resolving
 * IDs to human-readable names BEFORE passing data to calculators.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchGetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name
const getTableName = (baseName) => {
  const envVarName = `API_KINGSROOM_${baseName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

const VENUE_TABLE = getTableName('Venue');
const RECURRING_GAME_TABLE = getTableName('RecurringGame');
const GAME_TABLE = getTableName('Game');

// Day of week names for constructing game names
const DAY_NAMES = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
  'SUNDAY': 'Sunday', 'MONDAY': 'Monday', 'TUESDAY': 'Tuesday',
  'WEDNESDAY': 'Wednesday', 'THURSDAY': 'Thursday', 'FRIDAY': 'Friday', 'SATURDAY': 'Saturday'
};

/**
 * Batch fetch items by primary key from any table.
 * Handles chunking for BatchGetCommand (max 100 items per request).
 * 
 * @param {string} tableName - DynamoDB table name
 * @param {string[]} ids - Array of primary key IDs to fetch
 * @returns {Map<string, Object>} - Map of id -> item
 */
async function batchFetchByIds(tableName, ids) {
  const results = new Map();
  if (!ids || ids.length === 0) return results;

  // Dedupe IDs
  const uniqueIds = [...new Set(ids.filter(id => id && id !== 'unknown'))];
  if (uniqueIds.length === 0) return results;

  // Process in chunks of 100 (DynamoDB BatchGetCommand limit)
  const CHUNK_SIZE = 100;
  
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    
    try {
      const response = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: chunk.map(id => ({ id })),
            // Only fetch fields we need to minimize read capacity
            ProjectionExpression: 'id, #name, displayName, entityId, venueId, dayOfWeek, typicalBuyIn, typicalGuarantee, gameType, aliases',
            ExpressionAttributeNames: { '#name': 'name' }
          }
        }
      }));

      // Add results to map
      const items = response.Responses?.[tableName] || [];
      for (const item of items) {
        results.set(item.id, item);
      }

      // Handle unprocessed keys (retry once)
      const unprocessed = response.UnprocessedKeys?.[tableName]?.Keys;
      if (unprocessed && unprocessed.length > 0) {
        console.warn(`Retrying ${unprocessed.length} unprocessed keys from ${tableName}`);
        const retryResponse = await docClient.send(new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: unprocessed,
              ProjectionExpression: 'id, #name, displayName, entityId, venueId, dayOfWeek, typicalBuyIn, typicalGuarantee, gameType, aliases',
              ExpressionAttributeNames: { '#name': 'name' }
            }
          }
        }));
        const retryItems = retryResponse.Responses?.[tableName] || [];
        for (const item of retryItems) {
          results.set(item.id, item);
        }
      }
    } catch (error) {
      console.error(`BatchGet failed for ${tableName}:`, error.message);
      // Continue with partial results rather than failing completely
    }
  }

  return results;
}

/**
 * Fetch venue names for a list of venue IDs.
 * Returns a Map of venueId -> { name, entityId }
 */
async function fetchVenueNames(venueIds) {
  const venueMap = await batchFetchByIds(VENUE_TABLE, venueIds);
  
  // Transform to simpler structure
  const result = new Map();
  for (const [id, venue] of venueMap) {
    result.set(id, {
      name: venue.name || 'Unknown Venue',
      entityId: venue.entityId,
      aliases: venue.aliases || []
    });
  }
  
  return result;
}

/**
 * Fetch recurring game names and details for a list of recurring game IDs.
 * Returns a Map of recurringGameId -> { name, displayName, venueName, dayOfWeek, ... }
 */
async function fetchRecurringGameDetails(recurringGameIds) {
  const rgMap = await batchFetchByIds(RECURRING_GAME_TABLE, recurringGameIds);
  
  // Also fetch venue names for the recurring games
  const venueIds = [...new Set([...rgMap.values()].map(rg => rg.venueId).filter(Boolean))];
  const venueNames = await fetchVenueNames(venueIds);
  
  // Transform to richer structure
  const result = new Map();
  for (const [id, rg] of rgMap) {
    const venueName = rg.venueId ? venueNames.get(rg.venueId)?.name : null;
    result.set(id, {
      name: rg.name,
      displayName: rg.displayName || rg.name,
      venueName: venueName || 'Unknown Venue',
      venueId: rg.venueId,
      dayOfWeek: rg.dayOfWeek,
      typicalBuyIn: rg.typicalBuyIn,
      typicalGuarantee: rg.typicalGuarantee,
      gameType: rg.gameType
    });
  }
  
  return result;
}

/**
 * Construct a human-readable game name from snapshot data.
 * Used when no recurring game template exists.
 * 
 * Examples:
 * - "Monday $100 NLH Tournament" 
 * - "Friday $50 PLO Cash Game"
 * - "Wednesday $200 Bounty"
 */
function constructGameName(snapshot) {
  const parts = [];
  
  // Day of week
  if (snapshot.gameStartDateTime) {
    const date = new Date(snapshot.gameStartDateTime);
    const day = DAY_NAMES[date.getDay()];
    if (day) parts.push(day);
  }
  
  // Buy-in amount
  const buyIn = snapshot.buyInAmount || snapshot.totalBuyIn || snapshot.buyIn;
  if (buyIn && buyIn > 0) {
    parts.push(`$${Math.round(buyIn)}`);
  }
  
  // Game variant (if available)
  if (snapshot.gameVariant) {
    const variant = snapshot.gameVariant.toUpperCase();
    if (variant !== 'NLHE' && variant !== 'NO_LIMIT_HOLDEM') {
      parts.push(variant);
    }
  }
  
  // Tournament type or game type
  if (snapshot.tournamentType) {
    const type = snapshot.tournamentType.replace(/_/g, ' ').toLowerCase();
    // Capitalize first letter of each word
    const formatted = type.replace(/\b\w/g, l => l.toUpperCase());
    parts.push(formatted);
  } else if (snapshot.gameType === 'CASH_GAME') {
    parts.push('Cash Game');
  } else if (snapshot.gameType === 'TOURNAMENT') {
    parts.push('Tournament');
  }
  
  // Guarantee (if significant)
  if (snapshot.guaranteeAmount && snapshot.guaranteeAmount >= 1000) {
    const gtd = snapshot.guaranteeAmount >= 1000 
      ? `$${Math.round(snapshot.guaranteeAmount / 1000)}K GTD`
      : `$${snapshot.guaranteeAmount} GTD`;
    parts.push(gtd);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'Game';
}

/**
 * Enrich snapshots with resolved venue and game names.
 * This is the main entry point - call this on snapshots before passing to calculators.
 * 
 * @param {Object[]} snapshots - Array of GameFinancialSnapshot records
 * @returns {Object[]} - Same snapshots with venueName and gameName populated
 */
async function enrichSnapshotsWithNames(snapshots) {
  if (!snapshots || snapshots.length === 0) return snapshots;

  console.log(`Enriching ${snapshots.length} snapshots with names...`);

  // Collect unique IDs
  const venueIds = [...new Set(snapshots.map(s => s.venueId).filter(Boolean))];
  const recurringGameIds = [...new Set(snapshots.map(s => s.recurringGameId).filter(Boolean))];
  
  console.log(`Fetching names for ${venueIds.length} venues and ${recurringGameIds.length} recurring games`);

  // Batch fetch all names in parallel
  const [venueMap, recurringGameMap] = await Promise.all([
    fetchVenueNames(venueIds),
    fetchRecurringGameDetails(recurringGameIds)
  ]);

  console.log(`Resolved ${venueMap.size} venues and ${recurringGameMap.size} recurring games`);

  // Enrich each snapshot
  return snapshots.map(snapshot => {
    // Resolve venue name
    const venueName = snapshot.venueId 
      ? (venueMap.get(snapshot.venueId)?.name || 'Unknown Venue')
      : 'No Venue';
    
    // Resolve game name
    let gameName;
    let recurringGameName = null;
    
    if (snapshot.recurringGameId) {
      const rg = recurringGameMap.get(snapshot.recurringGameId);
      if (rg) {
        gameName = rg.displayName || rg.name;
        recurringGameName = rg.name;
      } else {
        gameName = constructGameName(snapshot);
      }
    } else {
      // No recurring game - construct name from available data
      gameName = constructGameName(snapshot);
    }

    return {
      ...snapshot,
      venueName,
      gameName,
      recurringGameName,
      // Also include the resolved recurring game details for richer analysis
      _resolvedRecurringGame: snapshot.recurringGameId 
        ? recurringGameMap.get(snapshot.recurringGameId) 
        : null
    };
  });
}

/**
 * Fetch game names directly from Game table.
 * Use sparingly - prefer recurring game names when available.
 * 
 * @param {string[]} gameIds - Array of game IDs
 * @returns {Map<string, string>} - Map of gameId -> name
 */
async function fetchGameNames(gameIds) {
  const gameMap = await batchFetchByIds(GAME_TABLE, gameIds);
  
  const result = new Map();
  for (const [id, game] of gameMap) {
    result.set(id, game.name || 'Unknown Game');
  }
  
  return result;
}

/**
 * Create a venue ID to name lookup from already-enriched snapshots.
 * Useful when you need to look up venue names without re-fetching.
 */
function buildVenueLookupFromSnapshots(enrichedSnapshots) {
  const lookup = new Map();
  for (const s of enrichedSnapshots) {
    if (s.venueId && s.venueName) {
      lookup.set(s.venueId, s.venueName);
    }
  }
  return lookup;
}

module.exports = {
  enrichSnapshotsWithNames,
  fetchVenueNames,
  fetchRecurringGameDetails,
  fetchGameNames,
  constructGameName,
  buildVenueLookupFromSnapshots,
  batchFetchByIds
};
