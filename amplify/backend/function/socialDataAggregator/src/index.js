/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_PLAYERRESULTTABLE_ARN
	API_KINGSROOM_PLAYERRESULTTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_PLAYERTICKETTABLE_ARN
	API_KINGSROOM_PLAYERTICKETTABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME
	API_KINGSROOM_SOCIALPOSTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTTABLE_NAME
	API_KINGSROOM_TICKETTEMPLATETABLE_ARN
	API_KINGSROOM_TICKETTEMPLATETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * socialDataAggregator/index.js
 * 
 * VERSION: 3.0.0
 * 
 * PURPOSE:
 * Aggregates data from linked social posts to enrich Game records.
 * Handles prizepool payouts, ticket awards, bad beat jackpots, and other
 * data that only appears in social media posts (not on the tournament page).
 * 
 * NEW IN v3.0.0:
 * - Full integration with socialPostProcessor ticket extraction
 * - Uses new ticket aggregate fields from SocialPostGameData
 * - Uses reconciliation fields for discrepancy detection
 * - Supports multiple ticket types (ACCUMULATOR_TICKET, SATELLITE_TICKET, etc.)
 * - Reads pre-computed ticket data from SocialPostGameLink
 * - Enhanced placement processing with ticket details
 * 
 * PREVIOUS IN v2.0.0:
 * - Smart ticket value calculation when count known but value unknown
 * - PlayerTicket UPSERT for players who won tickets
 * - TicketTemplate auto-creation for recurring ticket programs
 * 
 * TRIGGERS:
 * 1. DynamoDB Stream on SocialPostGameLink table (INSERT events)
 * 2. Direct invocation from linkOperations.js after manual linking
 * 3. GraphQL mutation for manual re-aggregation
 * 
 * FLOW:
 * 1. Social post linked to game → Stream event fires
 * 2. Fetch all linked posts for the game (including the new one)
 * 3. Aggregate extracted data from all RESULT posts
 * 4. Use pre-computed ticket aggregates OR calculate ticket values
 * 5. Update Game record with aggregated social data
 * 6. UPSERT PlayerTickets for players with ticket awards
 * 7. Optionally trigger gameFinancialsProcessor for recalculation
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

// ===================================================================
// CONSTANTS
// ===================================================================

// Ticket types that count as "accumulator" tickets for Game.numberOfAccumulatorTicketsPaid
const ACCUMULATOR_TICKET_TYPES = [
  'ACCUMULATOR_TICKET',
  'SATELLITE_TICKET',
  'SERIES_TICKET'
];

// All valid ticket types (from NonCashPrizeType enum)
const VALID_TICKET_TYPES = [
  'ACCUMULATOR_TICKET',
  'SATELLITE_TICKET',
  'BOUNTY_TICKET',
  'TOURNAMENT_ENTRY',
  'SERIES_TICKET',
  'MAIN_EVENT_SEAT',
  'VALUED_SEAT',
  'TRAVEL_PACKAGE',
  'ACCOMMODATION_PACKAGE',
  'VOUCHER',
  'FOOD_CREDIT',
  'CASINO_CREDIT',
  'MERCHANDISE',
  'POINTS',
  'OTHER'
];

// ===================================================================
// HELPERS
// ===================================================================

const getTableName = (modelName) => {
  const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) return process.env[envVarName];
  
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${modelName}-${apiId}-${env}`;
};

/**
 * Round a number UP to the nearest increment
 */
const roundUpToNearest = (value, increment = 10) => {
  return Math.ceil(value / increment) * increment;
};

/**
 * Safely parse JSON, returning null on failure
 */
const safeParseJSON = (str) => {
  if (!str) return null;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
};

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
const getOrdinalSuffix = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

// ===================================================================
// DATA FETCHERS
// ===================================================================

/**
 * Get all verified/active links for a game
 */
const getLinksForGame = async (gameId) => {
  const tableName = getTableName('SocialPostGameLink');
  
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'byGameSocialPostLink',
    KeyConditionExpression: 'gameId = :gameId',
    ExpressionAttributeValues: {
      ':gameId': gameId
    }
  }));
  
  // Filter out rejected links
  return (result.Items || []).filter(link => link.linkType !== 'REJECTED');
};

/**
 * Get social post by ID
 */
const getSocialPost = async (socialPostId) => {
  const tableName = getTableName('SocialPost');
  
  const result = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { id: socialPostId }
  }));
  
  return result.Item;
};

/**
 * Get extracted game data (SocialPostGameData) by ID
 */
const getExtractedGameData = async (extractedGameDataId) => {
  if (!extractedGameDataId) return null;
  
  const tableName = getTableName('SocialPostGameData');
  
  const result = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { id: extractedGameDataId }
  }));
  
  return result.Item;
};

/**
 * Get extracted game data by social post ID
 */
const getExtractedGameDataByPostId = async (socialPostId) => {
  if (!socialPostId) return null;
  
  const tableName = getTableName('SocialPostGameData');
  
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'bySocialPost',
    KeyConditionExpression: 'socialPostId = :pid',
    ExpressionAttributeValues: {
      ':pid': socialPostId
    },
    Limit: 1
  }));
  
  return result.Items?.[0] || null;
};

/**
 * Get game by ID
 */
const getGame = async (gameId) => {
  const tableName = getTableName('Game');
  
  const result = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { id: gameId }
  }));
  
  return result.Item;
};

/**
 * Get player results for a game
 */
const getPlayerResultsForGame = async (gameId) => {
  const tableName = getTableName('PlayerResult');
  
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'byGame',
    KeyConditionExpression: 'gameId = :gameId',
    ExpressionAttributeValues: {
      ':gameId': gameId
    }
  }));
  
  return result.Items || [];
};

/**
 * Get or create ticket template for a program
 */
const getOrCreateTicketTemplate = async (templateData) => {
  const tableName = getTableName('TicketTemplate');
  const { programName, value, entityId, originGameId, ticketType = 'ACCUMULATOR_TICKET', validityDays = 365 } = templateData;
  
  // Create a deterministic ID based on program name and value
  const templateId = `TICKET_${programName.replace(/\s+/g, '_').toUpperCase()}_${value}`;
  
  const existing = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { id: templateId }
  }));
  
  if (existing.Item) {
    return existing.Item;
  }
  
  // Create new template
  const now = new Date().toISOString();
  const newTemplate = {
    id: templateId,
    name: `${programName} $${value} Credit`,
    description: `${ticketType} for ${programName} worth $${value}`,
    value: value,
    ticketType: ticketType,
    validityDays: validityDays,
    originGameId: originGameId,
    entityId: entityId,
    createdAt: now,
    updatedAt: now,
    __typename: 'TicketTemplate',
    _version: 1,
    _lastChangedAt: Date.now()
  };
  
  await ddbDocClient.send(new PutCommand({
    TableName: tableName,
    Item: newTemplate
  }));
  
  console.log(`[AGGREGATOR] Created ticket template: ${templateId}`);
  return newTemplate;
};

/**
 * Get existing player ticket by composite key
 */
const getExistingPlayerTicket = async (playerId, wonFromGameId, ticketTemplateId) => {
  const tableName = getTableName('PlayerTicket');
  
  const result = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'byPlayer',
    KeyConditionExpression: 'playerId = :playerId',
    FilterExpression: 'wonFromGameId = :gameId AND ticketTemplateId = :templateId',
    ExpressionAttributeValues: {
      ':playerId': playerId,
      ':gameId': wonFromGameId,
      ':templateId': ticketTemplateId
    }
  }));
  
  return result.Items?.[0] || null;
};

// ===================================================================
// TICKET DATA EXTRACTION (v3.0.0 - Uses new SocialPostGameData fields)
// ===================================================================

/**
 * Extract ticket aggregates from SocialPostGameData (new v3.0.0 method)
 * 
 * Uses the pre-computed fields from placementParser:
 * - totalTicketsExtracted
 * - totalTicketValue  
 * - ticketCountByType
 * - ticketValueByType
 * - reconciliation_accumulatorTicketCount
 * - reconciliation_accumulatorTicketValue
 * 
 * @param {Object} extractedData - SocialPostGameData record
 * @returns {Object} Ticket aggregate data
 */
const extractTicketAggregatesFromData = (extractedData) => {
  if (!extractedData) {
    return { hasTickets: false };
  }
  
  const result = {
    hasTickets: false,
    totalTicketsExtracted: 0,
    totalTicketValue: null,
    ticketCountByType: {},
    ticketValueByType: {},
    
    // Accumulator-specific (for Game model)
    accumulatorTicketCount: 0,
    accumulatorTicketValue: null,
    
    // Winner ticket info
    winnerHasTicket: false,
    winnerTicketType: null,
    winnerTicketValue: null,
    
    // Advertised tickets (promo posts)
    hasAdvertisedTickets: false,
    advertisedTicketCount: null,
    advertisedTicketType: null,
    advertisedTicketValue: null,
    
    // Reconciliation
    reconciliation_totalPrizepoolPaid: null,
    reconciliation_cashPlusTotalTicketValue: null,
    
    source: 'extracted_data'
  };
  
  // Check for extracted tickets from result posts
  if (extractedData.totalTicketsExtracted > 0) {
    result.hasTickets = true;
    result.totalTicketsExtracted = extractedData.totalTicketsExtracted;
    result.totalTicketValue = extractedData.totalTicketValue;
    
    // Parse AWSJSON fields
    result.ticketCountByType = safeParseJSON(extractedData.ticketCountByType) || {};
    result.ticketValueByType = safeParseJSON(extractedData.ticketValueByType) || {};
    
    // Use reconciliation fields for accumulator count/value
    result.accumulatorTicketCount = extractedData.reconciliation_accumulatorTicketCount || 0;
    result.accumulatorTicketValue = extractedData.reconciliation_accumulatorTicketValue || null;
    
    // Reconciliation totals
    result.reconciliation_totalPrizepoolPaid = extractedData.reconciliation_totalPrizepoolPaid;
    result.reconciliation_cashPlusTotalTicketValue = extractedData.reconciliation_cashPlusTotalTicketValue;
    
    console.log(`[AGGREGATOR] Extracted ${result.totalTicketsExtracted} tickets (${result.accumulatorTicketCount} accumulator)`);
  }
  
  // Check winner ticket info
  if (extractedData.extractedWinnerHasTicket) {
    result.winnerHasTicket = true;
    result.winnerTicketType = extractedData.extractedWinnerTicketType;
    result.winnerTicketValue = extractedData.extractedWinnerTicketValue;
  }
  
  // Check for advertised tickets (promo posts)
  if (extractedData.hasAdvertisedTickets) {
    result.hasAdvertisedTickets = true;
    result.advertisedTicketCount = extractedData.advertisedTicketCount;
    result.advertisedTicketType = extractedData.advertisedTicketType;
    result.advertisedTicketValue = extractedData.advertisedTicketValue;
    
    // If no result ticket data but we have promo data, use that
    if (!result.hasTickets && result.advertisedTicketCount) {
      result.hasTickets = true;
      result.totalTicketsExtracted = result.advertisedTicketCount;
      result.totalTicketValue = result.advertisedTicketValue;
      result.source = 'advertised';
    }
  }
  
  return result;
};

/**
 * Extract ticket data from SocialPostGameLink (pre-computed by gameToSocialMatcher)
 * 
 * @param {Object} link - SocialPostGameLink record
 * @returns {Object} Ticket data from link
 */
const extractTicketDataFromLink = (link) => {
  if (!link || !link.hasTicketData) {
    return null;
  }
  
  const ticketData = safeParseJSON(link.ticketData);
  if (!ticketData) {
    return null;
  }
  
  return {
    ...ticketData,
    hasReconciliationDiscrepancy: link.hasReconciliationDiscrepancy || false,
    reconciliationDiscrepancySeverity: link.reconciliationDiscrepancySeverity || null,
    reconciliationPreview: safeParseJSON(link.reconciliationPreview),
    source: 'link_precomputed'
  };
};

/**
 * Parse placements from extracted data (handles various formats)
 */
const parsePlacements = (extractedPlacements) => {
  if (!extractedPlacements) return [];
  
  if (Array.isArray(extractedPlacements)) {
    return extractedPlacements;
  }
  
  if (typeof extractedPlacements === 'string') {
    try {
      const parsed = JSON.parse(extractedPlacements);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[AGGREGATOR] Could not parse placements string');
      return [];
    }
  }
  
  return [];
};

/**
 * Count tickets from placement records (v3.0.0 - uses new placement format)
 * 
 * New placement format from placementParser includes:
 * - hasNonCashPrize: boolean
 * - primaryTicketType: NonCashPrizeType
 * - primaryTicketValue: number
 * - ticketCount: number
 * - nonCashPrizes: AWSJSON array
 * 
 * @param {Array} placements - Parsed placements
 * @returns {Object} Ticket count and details
 */
const countTicketsFromPlacements = (placements) => {
  const result = {
    count: 0,
    totalValue: 0,
    positions: [],
    ticketPlacements: [],
    byType: {}
  };
  
  if (!placements || placements.length === 0) {
    return result;
  }
  
  for (const placement of placements) {
    let hasTicket = false;
    let ticketType = null;
    let ticketValue = null;
    
    // Method 1: Check new primaryTicketType field (preferred)
    if (placement.primaryTicketType) {
      hasTicket = true;
      ticketType = placement.primaryTicketType;
      ticketValue = placement.primaryTicketValue || null;
    }
    // Method 2: Check hasNonCashPrize and nonCashPrizes array
    else if (placement.hasNonCashPrize && placement.nonCashPrizes) {
      const prizes = safeParseJSON(placement.nonCashPrizes) || [];
      const ticketPrize = prizes.find(p => VALID_TICKET_TYPES.includes(p?.prizeType));
      if (ticketPrize) {
        hasTicket = true;
        ticketType = ticketPrize.prizeType;
        ticketValue = ticketPrize.estimatedValue || null;
      }
    }
    // Method 3: Legacy asterisk detection
    else if (placement.rawText?.includes('*') || placement.cashPrizeRaw?.includes('*')) {
      hasTicket = true;
      ticketType = 'ACCUMULATOR_TICKET'; // Default assumption
    }
    
    if (hasTicket) {
      result.count++;
      result.positions.push(placement.place);
      
      if (ticketValue) {
        result.totalValue += ticketValue;
      }
      
      // Count by type
      const typeKey = ticketType || 'UNKNOWN';
      result.byType[typeKey] = (result.byType[typeKey] || 0) + 1;
      
      result.ticketPlacements.push({
        place: placement.place,
        playerName: placement.playerName,
        cashPrize: placement.cashPrize,
        ticketType,
        ticketValue,
        totalEstimatedValue: placement.totalEstimatedValue || null
      });
    }
  }
  
  result.positions.sort((a, b) => a - b);
  
  if (result.count > 0) {
    console.log(`[AGGREGATOR] Found ${result.count} tickets from placements at positions: ${result.positions.join(', ')}`);
  }
  
  return result;
};

/**
 * Extract ticket awards from social post content (fallback method)
 * Patterns like "Top 9 will receive $250 Sydney Millions credit"
 */
const extractTicketAwardsFromContent = (socialPost, extractedData) => {
  const result = {
    hasAccumulatorTickets: false,
    accumulatorTicketValue: null,
    numberOfAccumulatorTicketsPaid: null,
    ticketAwardDetails: null,
    ticketProgramName: null,
    ticketAwardPositions: null
  };
  
  const content = socialPost?.content || '';
  
  // Pattern 1: "N x $VALUE program_name credit"
  const creditPattern = /(\d+)\s*x\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s+([A-Za-z\s]+?)\s*credit/gi;
  let match = creditPattern.exec(content);
  
  if (match) {
    result.hasAccumulatorTickets = true;
    result.numberOfAccumulatorTicketsPaid = parseInt(match[1], 10);
    result.accumulatorTicketValue = parseFloat(match[2].replace(/,/g, ''));
    result.ticketProgramName = match[3].trim();
    result.ticketAwardDetails = {
      quantity: result.numberOfAccumulatorTicketsPaid,
      value: result.accumulatorTicketValue,
      totalValue: result.numberOfAccumulatorTicketsPaid * result.accumulatorTicketValue,
      program: result.ticketProgramName,
      source: 'content_pattern'
    };
    return result;
  }
  
  // Pattern 2: "Top N will receive $VALUE credits"
  const topNPattern = /top\s*(\d+)\s*(?:will\s+)?receive\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/gi;
  match = topNPattern.exec(content);
  
  if (match) {
    result.hasAccumulatorTickets = true;
    result.numberOfAccumulatorTicketsPaid = parseInt(match[1], 10);
    result.accumulatorTicketValue = parseFloat(match[2].replace(/,/g, ''));
    result.ticketAwardPositions = Array.from(
      { length: result.numberOfAccumulatorTicketsPaid }, 
      (_, i) => i + 1
    );
    result.ticketAwardDetails = {
      quantity: result.numberOfAccumulatorTicketsPaid,
      value: result.accumulatorTicketValue,
      totalValue: result.numberOfAccumulatorTicketsPaid * result.accumulatorTicketValue,
      positions: result.ticketAwardPositions,
      source: 'content_pattern'
    };
    return result;
  }
  
  // Pattern 3: Count only - "Top 9 finishers also receive accumulator credits"
  const countOnlyPattern = /top\s*(\d+)\s*(?:finishers?\s*)?(?:also\s+)?receive\s*(?:accumulator\s*)?(?:credits?|tickets?)/gi;
  match = countOnlyPattern.exec(content);
  
  if (match) {
    result.hasAccumulatorTickets = true;
    result.numberOfAccumulatorTicketsPaid = parseInt(match[1], 10);
    result.accumulatorTicketValue = null; // Will be calculated
    result.ticketAwardPositions = Array.from(
      { length: result.numberOfAccumulatorTicketsPaid }, 
      (_, i) => i + 1
    );
    result.ticketAwardDetails = {
      quantity: result.numberOfAccumulatorTicketsPaid,
      value: null,
      positions: result.ticketAwardPositions,
      source: 'content_pattern',
      valueNeedsCalculation: true
    };
    return result;
  }
  
  return result;
};

/**
 * Extract bad beat jackpot information
 */
const extractJackpotInfo = (socialPost, extractedData) => {
  const result = {
    hasJackpotContributions: false,
    jackpotAmount: null,
    jackpotType: null
  };
  
  // Check extracted data first
  if (extractedData?.extractedBadBeatJackpot) {
    result.hasJackpotContributions = true;
    result.jackpotAmount = extractedData.extractedBadBeatJackpot;
    result.jackpotType = 'BAD_BEAT';
    return result;
  }
  
  // Parse from content
  const content = socialPost?.content || '';
  const jackpotPattern = /(?:bad\s*beat|jackpot)[:\s]*\$?([\d,]+(?:\.\d{2})?)/gi;
  const match = jackpotPattern.exec(content);
  
  if (match) {
    result.hasJackpotContributions = true;
    result.jackpotAmount = parseFloat(match[1].replace(/,/g, ''));
    result.jackpotType = 'BAD_BEAT';
  }
  
  return result;
};

// ===================================================================
// SMART TICKET VALUE CALCULATION
// ===================================================================

/**
 * Calculate ticket value when we know the count but not individual value
 */
const calculateTicketValue = (game, numberOfTickets) => {
  const result = {
    calculated: false,
    value: null,
    method: null,
    confidence: 'LOW',
    details: {}
  };
  
  if (!numberOfTickets || numberOfTickets <= 0) {
    result.method = 'NO_TICKETS';
    return result;
  }
  
  const prizepoolPaid = game.prizepoolPaid;
  const prizepoolCalculated = game.prizepoolCalculated;
  
  // Method 1: prizepoolPaid - prizepoolCalculated
  if (prizepoolPaid && prizepoolCalculated && prizepoolPaid > prizepoolCalculated) {
    const difference = prizepoolPaid - prizepoolCalculated;
    const rawValue = difference / numberOfTickets;
    const roundedValue = roundUpToNearest(rawValue, 10);
    
    result.calculated = true;
    result.value = roundedValue;
    result.method = 'PRIZEPOOL_DIFFERENCE';
    result.confidence = 'MEDIUM';
    result.details = {
      prizepoolPaid,
      prizepoolCalculated,
      difference,
      rawValuePerTicket: rawValue,
      roundedValue,
      numberOfTickets,
      totalTicketValue: roundedValue * numberOfTickets
    };
    
    console.log(`[AGGREGATOR] Calculated ticket value: $${roundedValue} (from $${rawValue.toFixed(2)} raw)`);
    return result;
  }
  
  // Method 2: guaranteeAmount - prizepoolCalculated
  const guaranteeAmount = game.guaranteeAmount;
  if (guaranteeAmount && prizepoolCalculated && guaranteeAmount > prizepoolCalculated) {
    const difference = guaranteeAmount - prizepoolCalculated;
    const rawValue = difference / numberOfTickets;
    const roundedValue = roundUpToNearest(rawValue, 10);
    
    result.calculated = true;
    result.value = roundedValue;
    result.method = 'GUARANTEE_DIFFERENCE';
    result.confidence = 'LOW';
    result.details = {
      guaranteeAmount,
      prizepoolCalculated,
      difference,
      rawValuePerTicket: rawValue,
      roundedValue,
      numberOfTickets,
      totalTicketValue: roundedValue * numberOfTickets
    };
    
    console.log(`[AGGREGATOR] Calculated ticket value from guarantee: $${roundedValue}`);
    return result;
  }
  
  // Method 3: prizepoolAddedValue
  const prizepoolAddedValue = game.prizepoolAddedValue;
  if (prizepoolAddedValue && prizepoolAddedValue > 0) {
    const rawValue = prizepoolAddedValue / numberOfTickets;
    const roundedValue = roundUpToNearest(rawValue, 10);
    
    result.calculated = true;
    result.value = roundedValue;
    result.method = 'ADDED_VALUE';
    result.confidence = 'MEDIUM';
    result.details = {
      prizepoolAddedValue,
      rawValuePerTicket: rawValue,
      roundedValue,
      numberOfTickets,
      totalTicketValue: roundedValue * numberOfTickets
    };
    
    console.log(`[AGGREGATOR] Calculated ticket value from added value: $${roundedValue}`);
    return result;
  }
  
  result.method = 'INSUFFICIENT_DATA';
  result.details = {
    hasPrizepoolPaid: !!prizepoolPaid,
    hasPrizepoolCalculated: !!prizepoolCalculated,
    hasGuarantee: !!guaranteeAmount,
    hasPrizepoolAddedValue: !!prizepoolAddedValue
  };
  
  console.log(`[AGGREGATOR] Could not calculate ticket value - insufficient data`);
  return result;
};

// ===================================================================
// PLAYER TICKET UPSERT
// ===================================================================

/**
 * Create or update PlayerTicket records for players who won tickets
 */
const upsertPlayerTickets = async (game, aggregation) => {
  const result = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    tickets: []
  };
  
  if (!aggregation.hasAccumulatorTickets || !aggregation.accumulatorTicketValue) {
    console.log('[AGGREGATOR] No ticket awards to process');
    return result;
  }
  
  const ticketValue = aggregation.accumulatorTicketValue;
  const ticketCount = aggregation.numberOfAccumulatorTicketsPaid;
  const ticketPositions = aggregation.ticketAwardPositions || 
    Array.from({ length: ticketCount }, (_, i) => i + 1);
  const ticketType = aggregation.primaryTicketType || 'ACCUMULATOR_TICKET';
  
  console.log(`[AGGREGATOR] Processing ${ticketCount} ticket awards (${ticketType}) for positions: ${ticketPositions.join(', ')}`);
  
  // Get player results for this game
  const playerResults = await getPlayerResultsForGame(game.id);
  
  if (playerResults.length === 0) {
    console.log('[AGGREGATOR] No player results found for game');
    result.skipped = ticketCount;
    return result;
  }
  
  // Get or create ticket template
  const programName = aggregation.ticketProgramName || 'Accumulator';
  const template = await getOrCreateTicketTemplate({
    programName,
    value: ticketValue,
    entityId: game.entityId,
    originGameId: game.recurringGameId || game.id,
    ticketType
  });
  
  // Calculate expiry date (default 365 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (template.validityDays || 365));
  
  const tableName = getTableName('PlayerTicket');
  const now = new Date().toISOString();
  
  // Get detailed ticket info for each position from aggregation
  const ticketDetailsByPosition = {};
  if (aggregation.ticketPlacements) {
    for (const tp of aggregation.ticketPlacements) {
      ticketDetailsByPosition[tp.place] = tp;
    }
  }
  
  // Process each ticket-eligible position
  for (const position of ticketPositions) {
    const playerResult = playerResults.find(pr => pr.finishingPlace === position);
    
    if (!playerResult || !playerResult.playerId) {
      console.log(`[AGGREGATOR] No player found at position ${position}`);
      result.skipped++;
      continue;
    }
    
    try {
      const existingTicket = await getExistingPlayerTicket(
        playerResult.playerId,
        game.id,
        template.id
      );
      
      if (existingTicket) {
        console.log(`[AGGREGATOR] Ticket already exists for player ${playerResult.playerId} at position ${position}`);
        result.updated++;
        result.tickets.push({
          ticketId: existingTicket.id,
          playerId: playerResult.playerId,
          position,
          action: 'EXISTING'
        });
        continue;
      }
      
      // Get position-specific ticket details
      const positionDetails = ticketDetailsByPosition[position] || {};
      const positionTicketValue = positionDetails.ticketValue || ticketValue;
      const positionTicketType = positionDetails.ticketType || ticketType;
      
      // Create new ticket
      const ticketId = uuidv4();
      const newTicket = {
        id: ticketId,
        playerId: playerResult.playerId,
        ticketTemplateId: template.id,
        
        // Source tracking
        wonFromGameId: game.id,
        wonFromPosition: position,
        entityId: game.entityId,
        venueId: game.venueId,
        
        // Standard fields
        assignedAt: now,
        expiryDate: expiryDate.toISOString(),
        status: 'ACTIVE',
        usedInGameId: null,
        
        // Metadata
        ticketValue: positionTicketValue,
        ticketType: positionTicketType,
        programName: programName,
        awardReason: `Finished ${position}${getOrdinalSuffix(position)} place`,
        
        // NEW: Link to social post placement
        sourceSocialPostPlacementId: positionDetails.placementId || null,
        
        // DynamoDB fields
        createdAt: now,
        updatedAt: now,
        __typename: 'PlayerTicket',
        _version: 1,
        _lastChangedAt: Date.now()
      };
      
      await ddbDocClient.send(new PutCommand({
        TableName: tableName,
        Item: newTicket
      }));
      
      result.created++;
      result.tickets.push({
        ticketId,
        playerId: playerResult.playerId,
        position,
        value: positionTicketValue,
        type: positionTicketType,
        action: 'CREATED'
      });
      
      console.log(`[AGGREGATOR] Created ticket ${ticketId} for player ${playerResult.playerId} (${position}${getOrdinalSuffix(position)} place, $${positionTicketValue})`);
      
    } catch (error) {
      console.error(`[AGGREGATOR] Error creating ticket for position ${position}:`, error);
      result.errors.push({
        position,
        playerId: playerResult?.playerId,
        error: error.message
      });
    }
    
    result.processed++;
  }
  
  return result;
};

// ===================================================================
// AGGREGATION LOGIC (v3.0.0 - Enhanced with new ticket fields)
// ===================================================================

/**
 * Aggregate data from all linked social posts for a game
 */
const aggregateSocialDataForGame = async (gameId) => {
  console.log(`[AGGREGATOR] Aggregating social data for game: ${gameId}`);
  
  // Get all links for this game
  const links = await getLinksForGame(gameId);
  console.log(`[AGGREGATOR] Found ${links.length} active links`);
  
  if (links.length === 0) {
    return {
      hasLinkedSocialPosts: false,
      linkedSocialPostCount: 0,
      socialDataAggregation: null
    };
  }
  
  // Collect all post data
  const postDataCollection = [];
  
  for (const link of links) {
    const socialPost = await getSocialPost(link.socialPostId);
    if (!socialPost) continue;
    
    // Get extracted data - try link's socialPostGameDataId first, then post's extractedGameDataId
    let extractedData = null;
    if (link.socialPostGameDataId) {
      extractedData = await getExtractedGameData(link.socialPostGameDataId);
    } else if (socialPost.extractedGameDataId) {
      extractedData = await getExtractedGameData(socialPost.extractedGameDataId);
    } else {
      // Fallback: query by socialPostId
      extractedData = await getExtractedGameDataByPostId(socialPost.id);
    }
    
    // Extract pre-computed ticket data from link (if available from gameToSocialMatcher)
    const linkTicketData = extractTicketDataFromLink(link);
    
    postDataCollection.push({
      link,
      socialPost,
      extractedData,
      linkTicketData,
      isResult: socialPost.contentType === 'RESULT' || socialPost.isTournamentResult,
      isPromo: socialPost.contentType === 'PROMOTIONAL' || socialPost.isPromotional,
      isVerified: link.linkType === 'VERIFIED' || link.linkType === 'MANUAL_LINKED',
      postedAt: new Date(socialPost.postedAt)
    });
  }
  
  // Sort: RESULT > PROMO, VERIFIED > AUTO, Newer > Older
  postDataCollection.sort((a, b) => {
    if (a.isResult && !b.isResult) return -1;
    if (!a.isResult && b.isResult) return 1;
    if (a.isVerified && !b.isVerified) return -1;
    if (!a.isVerified && b.isVerified) return 1;
    return b.postedAt - a.postedAt;
  });
  
  // Initialize aggregation result
  const aggregation = {
    linkedSocialPostCount: links.length,
    hasLinkedSocialPosts: true,
    primaryResultPostId: null,
    
    // Prizepool data
    socialPrizepoolPaid: null,
    socialPrizepoolSource: null,
    socialGuarantee: null,
    socialTotalCashPaid: null,
    
    // Placement data
    placements: [],
    placementCount: 0,
    firstPlacePrize: null,
    
    // Ticket awards (v3.0.0 enhanced)
    hasAccumulatorTickets: false,
    accumulatorTicketValue: null,
    numberOfAccumulatorTicketsPaid: null,
    ticketAwardDetails: null,
    ticketProgramName: null,
    ticketAwardPositions: null,
    ticketValueCalculation: null,
    ticketPlacements: [],
    primaryTicketType: null,
    
    // v3.0.0: Detailed ticket breakdown
    totalTicketsExtracted: 0,
    totalTicketValue: null,
    ticketCountByType: {},
    ticketValueByType: {},
    
    // Reconciliation data
    hasReconciliationDiscrepancy: false,
    reconciliationDiscrepancySeverity: null,
    reconciliation_totalPrizepoolPaid: null,
    reconciliation_cashPlusTotalTicketValue: null,
    
    // Jackpot
    hasJackpotContributions: false,
    jackpotContributionAmount: null,
    
    // Entries (from social posts)
    socialTotalEntries: null,
    
    // Winner info
    extractedWinnerName: null,
    extractedWinnerCashPrize: null,
    extractedWinnerHasTicket: false,
    extractedWinnerTicketType: null,
    extractedWinnerTicketValue: null,
    
    // Metadata
    aggregatedAt: new Date().toISOString(),
    sourcePostIds: links.map(l => l.socialPostId),
    resultPostIds: [],
    promoPostIds: []
  };
  
  // Process each post
  for (const item of postDataCollection) {
    const { socialPost, extractedData, linkTicketData, isResult, isPromo } = item;
    
    // Track post types
    if (isResult) {
      aggregation.resultPostIds.push(socialPost.id);
      if (!aggregation.primaryResultPostId) {
        aggregation.primaryResultPostId = socialPost.id;
      }
    } else if (isPromo) {
      aggregation.promoPostIds.push(socialPost.id);
    }
    
    // =========================================================================
    // v3.0.0: First try to use pre-computed ticket data from link
    // =========================================================================
    if (linkTicketData && !aggregation.hasAccumulatorTickets) {
      console.log(`[AGGREGATOR] Using pre-computed ticket data from link`);
      
      aggregation.hasAccumulatorTickets = linkTicketData.totalTicketsExtracted > 0;
      aggregation.totalTicketsExtracted = linkTicketData.totalTicketsExtracted || 0;
      aggregation.totalTicketValue = linkTicketData.totalTicketValue;
      aggregation.ticketCountByType = linkTicketData.ticketCountByType || {};
      aggregation.ticketValueByType = linkTicketData.ticketValueByType || {};
      
      aggregation.numberOfAccumulatorTicketsPaid = linkTicketData.reconciliation_accumulatorTicketCount || 0;
      aggregation.accumulatorTicketValue = linkTicketData.reconciliation_accumulatorTicketValue;
      
      aggregation.socialTotalCashPaid = linkTicketData.totalCashPaid;
      aggregation.reconciliation_totalPrizepoolPaid = linkTicketData.reconciliation_totalPrizepoolPaid;
      aggregation.reconciliation_cashPlusTotalTicketValue = linkTicketData.reconciliation_cashPlusTotalTicketValue;
      
      aggregation.hasReconciliationDiscrepancy = linkTicketData.hasReconciliationDiscrepancy || false;
      aggregation.reconciliationDiscrepancySeverity = linkTicketData.reconciliationDiscrepancySeverity;
      
      aggregation.extractedWinnerHasTicket = linkTicketData.extractedWinnerHasTicket || false;
      aggregation.extractedWinnerTicketType = linkTicketData.extractedWinnerTicketType;
      aggregation.extractedWinnerTicketValue = linkTicketData.extractedWinnerTicketValue;
      
      // Set positions as top N if we have count
      if (aggregation.numberOfAccumulatorTicketsPaid > 0) {
        aggregation.ticketAwardPositions = Array.from(
          { length: aggregation.numberOfAccumulatorTicketsPaid },
          (_, i) => i + 1
        );
      }
      
      aggregation.ticketAwardDetails = {
        quantity: aggregation.numberOfAccumulatorTicketsPaid,
        value: aggregation.accumulatorTicketValue,
        totalValue: (aggregation.accumulatorTicketValue || 0) * (aggregation.numberOfAccumulatorTicketsPaid || 0),
        positions: aggregation.ticketAwardPositions,
        source: 'link_precomputed'
      };
    }
    
    // =========================================================================
    // Extract data from SocialPostGameData
    // =========================================================================
    if (extractedData) {
      // Basic extraction data
      if (!aggregation.socialPrizepoolPaid && extractedData.extractedPrizePool) {
        aggregation.socialPrizepoolPaid = extractedData.extractedPrizePool;
        aggregation.socialPrizepoolSource = socialPost.id;
      }
      
      if (!aggregation.socialGuarantee && extractedData.extractedGuarantee) {
        aggregation.socialGuarantee = extractedData.extractedGuarantee;
      }
      
      if (!aggregation.socialTotalEntries && extractedData.extractedTotalEntries) {
        aggregation.socialTotalEntries = extractedData.extractedTotalEntries;
      }
      
      if (!aggregation.firstPlacePrize && extractedData.extractedFirstPlacePrize) {
        aggregation.firstPlacePrize = extractedData.extractedFirstPlacePrize;
      }
      
      // Winner info
      if (!aggregation.extractedWinnerName && extractedData.extractedWinnerName) {
        aggregation.extractedWinnerName = extractedData.extractedWinnerName;
        aggregation.extractedWinnerCashPrize = extractedData.extractedWinnerCashPrize || extractedData.extractedWinnerPrize;
      }
      
      // v3.0.0: Use new ticket aggregate fields if not already set from link
      if (!aggregation.hasAccumulatorTickets) {
        const ticketAggregates = extractTicketAggregatesFromData(extractedData);
        
        if (ticketAggregates.hasTickets) {
          aggregation.hasAccumulatorTickets = true;
          aggregation.totalTicketsExtracted = ticketAggregates.totalTicketsExtracted;
          aggregation.totalTicketValue = ticketAggregates.totalTicketValue;
          aggregation.ticketCountByType = ticketAggregates.ticketCountByType;
          aggregation.ticketValueByType = ticketAggregates.ticketValueByType;
          
          aggregation.numberOfAccumulatorTicketsPaid = ticketAggregates.accumulatorTicketCount;
          aggregation.accumulatorTicketValue = ticketAggregates.accumulatorTicketValue;
          
          aggregation.socialTotalCashPaid = extractedData.totalCashPaid;
          aggregation.reconciliation_totalPrizepoolPaid = ticketAggregates.reconciliation_totalPrizepoolPaid;
          aggregation.reconciliation_cashPlusTotalTicketValue = ticketAggregates.reconciliation_cashPlusTotalTicketValue;
          
          if (ticketAggregates.winnerHasTicket) {
            aggregation.extractedWinnerHasTicket = true;
            aggregation.extractedWinnerTicketType = ticketAggregates.winnerTicketType;
            aggregation.extractedWinnerTicketValue = ticketAggregates.winnerTicketValue;
          }
          
          // Set positions as top N
          if (aggregation.numberOfAccumulatorTicketsPaid > 0) {
            aggregation.ticketAwardPositions = Array.from(
              { length: aggregation.numberOfAccumulatorTicketsPaid },
              (_, i) => i + 1
            );
          }
          
          aggregation.ticketAwardDetails = {
            quantity: aggregation.numberOfAccumulatorTicketsPaid,
            value: aggregation.accumulatorTicketValue,
            totalValue: (aggregation.accumulatorTicketValue || 0) * (aggregation.numberOfAccumulatorTicketsPaid || 0),
            positions: aggregation.ticketAwardPositions,
            source: ticketAggregates.source
          };
          
          console.log(`[AGGREGATOR] Set ticket data from extraction: ${aggregation.numberOfAccumulatorTicketsPaid} tickets`);
        }
      }
      
      // Process placements
      const placements = parsePlacements(extractedData.extractedPlacements);
      if (placements.length > 0 && aggregation.placements.length === 0) {
        aggregation.placements = placements;
        aggregation.placementCount = placements.length;
        
        // Count tickets from placements (fallback method)
        if (!aggregation.hasAccumulatorTickets) {
          const ticketCountFromPlacements = countTicketsFromPlacements(placements);
          if (ticketCountFromPlacements.count > 0) {
            aggregation.hasAccumulatorTickets = true;
            aggregation.numberOfAccumulatorTicketsPaid = ticketCountFromPlacements.count;
            aggregation.ticketAwardPositions = ticketCountFromPlacements.positions;
            aggregation.ticketPlacements = ticketCountFromPlacements.ticketPlacements;
            aggregation.ticketCountByType = ticketCountFromPlacements.byType;
            
            if (ticketCountFromPlacements.totalValue > 0) {
              aggregation.totalTicketValue = ticketCountFromPlacements.totalValue;
              aggregation.accumulatorTicketValue = ticketCountFromPlacements.totalValue / ticketCountFromPlacements.count;
            }
            
            aggregation.ticketAwardDetails = {
              quantity: ticketCountFromPlacements.count,
              positions: ticketCountFromPlacements.positions,
              placements: ticketCountFromPlacements.ticketPlacements,
              source: 'placement_parser',
              valueNeedsCalculation: !ticketCountFromPlacements.totalValue
            };
            
            console.log(`[AGGREGATOR] Set ticket count from placements: ${ticketCountFromPlacements.count}`);
          }
        }
      }
    }
    
    // Fallback: Extract ticket awards from post content
    if (!aggregation.hasAccumulatorTickets) {
      const ticketInfo = extractTicketAwardsFromContent(socialPost, extractedData);
      if (ticketInfo.hasAccumulatorTickets) {
        aggregation.hasAccumulatorTickets = true;
        aggregation.numberOfAccumulatorTicketsPaid = ticketInfo.numberOfAccumulatorTicketsPaid;
        aggregation.ticketProgramName = ticketInfo.ticketProgramName;
        aggregation.ticketAwardPositions = ticketInfo.ticketAwardPositions;
        
        if (ticketInfo.accumulatorTicketValue) {
          aggregation.accumulatorTicketValue = ticketInfo.accumulatorTicketValue;
          aggregation.ticketAwardDetails = ticketInfo.ticketAwardDetails;
        } else {
          aggregation.ticketAwardDetails = {
            quantity: ticketInfo.numberOfAccumulatorTicketsPaid,
            positions: ticketInfo.ticketAwardPositions,
            source: 'content_pattern',
            valueNeedsCalculation: true
          };
        }
        console.log(`[AGGREGATOR] Set ticket count from content pattern: ${ticketInfo.numberOfAccumulatorTicketsPaid}`);
      }
    }
    
    // Try to get ticket value from content if we have count but no value
    if (aggregation.hasAccumulatorTickets && !aggregation.accumulatorTicketValue) {
      const ticketInfo = extractTicketAwardsFromContent(socialPost, extractedData);
      if (ticketInfo.accumulatorTicketValue) {
        aggregation.accumulatorTicketValue = ticketInfo.accumulatorTicketValue;
        aggregation.ticketProgramName = ticketInfo.ticketProgramName || aggregation.ticketProgramName;
        if (aggregation.ticketAwardDetails) {
          aggregation.ticketAwardDetails.value = ticketInfo.accumulatorTicketValue;
          aggregation.ticketAwardDetails.totalValue = ticketInfo.accumulatorTicketValue * aggregation.numberOfAccumulatorTicketsPaid;
          aggregation.ticketAwardDetails.valueNeedsCalculation = false;
        }
        console.log(`[AGGREGATOR] Added ticket value from content: $${ticketInfo.accumulatorTicketValue}`);
      }
    }
    
    // Extract jackpot info
    const jackpotInfo = extractJackpotInfo(socialPost, extractedData);
    if (jackpotInfo.hasJackpotContributions && !aggregation.hasJackpotContributions) {
      aggregation.hasJackpotContributions = true;
      aggregation.jackpotContributionAmount = jackpotInfo.jackpotAmount;
    }
  }
  
  // Determine primary ticket type
  if (aggregation.hasAccumulatorTickets && aggregation.ticketCountByType) {
    const types = Object.entries(aggregation.ticketCountByType);
    if (types.length > 0) {
      types.sort((a, b) => b[1] - a[1]);
      aggregation.primaryTicketType = types[0][0];
    }
  }
  
  return aggregation;
};

// ===================================================================
// GAME UPDATE (v3.0.0 - Enhanced with new ticket fields)
// ===================================================================

/**
 * Update game with aggregated social data
 */
const updateGameWithSocialData = async (gameId, aggregation, options = {}) => {
  console.log(`[AGGREGATOR] Updating game ${gameId} with social data`);
  
  const tableName = getTableName('Game');
  const now = new Date().toISOString();
  
  // Build update expression
  const updateParts = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  // Link counts
  updateParts.push('#linkedSocialPostCount = :linkedCount');
  expressionAttributeNames['#linkedSocialPostCount'] = 'linkedSocialPostCount';
  expressionAttributeValues[':linkedCount'] = aggregation.linkedSocialPostCount;
  
  updateParts.push('#hasLinkedSocialPosts = :hasLinked');
  expressionAttributeNames['#hasLinkedSocialPosts'] = 'hasLinkedSocialPosts';
  expressionAttributeValues[':hasLinked'] = aggregation.hasLinkedSocialPosts;
  
  // Primary result post
  if (aggregation.primaryResultPostId) {
    updateParts.push('#primaryResultPostId = :primaryPostId');
    expressionAttributeNames['#primaryResultPostId'] = 'primaryResultPostId';
    expressionAttributeValues[':primaryPostId'] = aggregation.primaryResultPostId;
  }
  
  // Ticket data
  if (aggregation.hasAccumulatorTickets) {
    updateParts.push('#hasAccumulatorTickets = :hasTickets');
    expressionAttributeNames['#hasAccumulatorTickets'] = 'hasAccumulatorTickets';
    expressionAttributeValues[':hasTickets'] = true;
    
    if (aggregation.accumulatorTicketValue) {
      updateParts.push('#accumulatorTicketValue = :ticketValue');
      expressionAttributeNames['#accumulatorTicketValue'] = 'accumulatorTicketValue';
      expressionAttributeValues[':ticketValue'] = aggregation.accumulatorTicketValue;
    }
    
    if (aggregation.numberOfAccumulatorTicketsPaid) {
      updateParts.push('#numberOfAccumulatorTicketsPaid = :ticketCount');
      expressionAttributeNames['#numberOfAccumulatorTicketsPaid'] = 'numberOfAccumulatorTicketsPaid';
      expressionAttributeValues[':ticketCount'] = aggregation.numberOfAccumulatorTicketsPaid;
    }
  }
  
  // v3.0.0: Store ticket breakdown
  if (aggregation.ticketCountByType && Object.keys(aggregation.ticketCountByType).length > 0) {
    updateParts.push('#socialTicketCountByType = :ticketByType');
    expressionAttributeNames['#socialTicketCountByType'] = 'socialTicketCountByType';
    expressionAttributeValues[':ticketByType'] = JSON.stringify(aggregation.ticketCountByType);
  }
  
  // Jackpot data
  if (aggregation.hasJackpotContributions) {
    updateParts.push('#hasJackpotContributions = :hasJackpot');
    expressionAttributeNames['#hasJackpotContributions'] = 'hasJackpotContributions';
    expressionAttributeValues[':hasJackpot'] = true;
    
    if (aggregation.jackpotContributionAmount) {
      updateParts.push('#jackpotContributionAmount = :jackpotAmount');
      expressionAttributeNames['#jackpotContributionAmount'] = 'jackpotContributionAmount';
      expressionAttributeValues[':jackpotAmount'] = aggregation.jackpotContributionAmount;
    }
  }
  
  // Prizepool override
  if (aggregation.socialPrizepoolPaid && options.overridePrizepool) {
    updateParts.push('#prizepoolPaid = :prizepoolPaid');
    expressionAttributeNames['#prizepoolPaid'] = 'prizepoolPaid';
    expressionAttributeValues[':prizepoolPaid'] = aggregation.socialPrizepoolPaid;
  }
  
  // v3.0.0: Store reconciliation data
  if (aggregation.hasReconciliationDiscrepancy) {
    updateParts.push('#hasReconciliationDiscrepancy = :hasDiscrepancy');
    expressionAttributeNames['#hasReconciliationDiscrepancy'] = 'hasReconciliationDiscrepancy';
    expressionAttributeValues[':hasDiscrepancy'] = true;
  }
  
  // Store full aggregation as JSON
  updateParts.push('#socialDataAggregation = :aggregation');
  expressionAttributeNames['#socialDataAggregation'] = 'socialDataAggregation';
  expressionAttributeValues[':aggregation'] = JSON.stringify(aggregation);
  
  // Timestamp
  updateParts.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = now;
  
  await ddbDocClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { id: gameId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }));
  
  console.log(`[AGGREGATOR] Game ${gameId} updated successfully`);
  
  return {
    gameId,
    updatedFields: Object.values(expressionAttributeNames),
    aggregation
  };
};

// ===================================================================
// FINANCIAL RECALCULATION TRIGGER
// ===================================================================

const triggerFinancialsRecalculation = async (gameId) => {
  const functionName = process.env.FUNCTION_GAMEFINANCIALSPROCESSOR_NAME || 
                       `gameFinancialsProcessor-${process.env.ENV || 'staging'}`;
  
  console.log(`[AGGREGATOR] Triggering financials recalculation for game ${gameId}`);
  
  try {
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        gameId: gameId,
        options: { saveToDatabase: true }
      })
    }));
    
    console.log(`[AGGREGATOR] Financials recalculation triggered, status: ${response.StatusCode}`);
    return { triggered: true, statusCode: response.StatusCode };
    
  } catch (error) {
    console.error(`[AGGREGATOR] Failed to trigger financials recalculation:`, error);
    return { triggered: false, error: error.message };
  }
};

// ===================================================================
// MAIN PROCESSING FUNCTION
// ===================================================================

/**
 * Main function to process a game's social data
 */
const processSocialDataForGame = async (gameId, options = {}) => {
  const {
    triggerFinancials = true,
    overridePrizepool = false,
    createPlayerTickets = true,
    returnAggregation = true
  } = options;
  
  console.log(`[AGGREGATOR] Processing social data for game ${gameId}`);
  const startTime = Date.now();
  
  try {
    // Step 1: Get game record (needed for ticket calculation)
    const game = await getGame(gameId);
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }
    
    // Step 2: Aggregate data from all linked posts
    const aggregation = await aggregateSocialDataForGame(gameId);
    
    if (!aggregation.hasLinkedSocialPosts) {
      console.log(`[AGGREGATOR] No linked social posts for game ${gameId}`);
      return {
        success: true,
        gameId,
        message: 'No linked social posts',
        linkedPostCount: 0,
        processingTimeMs: Date.now() - startTime
      };
    }
    
    // Step 3: Calculate ticket value if we have count but not value
    if (aggregation.hasAccumulatorTickets && 
        !aggregation.accumulatorTicketValue && 
        aggregation.numberOfAccumulatorTicketsPaid) {
      
      console.log('[AGGREGATOR] Calculating ticket value...');
      const ticketCalc = calculateTicketValue(game, aggregation.numberOfAccumulatorTicketsPaid);
      
      if (ticketCalc.calculated && ticketCalc.value) {
        aggregation.accumulatorTicketValue = ticketCalc.value;
        aggregation.ticketValueCalculation = ticketCalc;
        aggregation.ticketAwardDetails = {
          ...(aggregation.ticketAwardDetails || {}),
          value: ticketCalc.value,
          totalValue: ticketCalc.value * aggregation.numberOfAccumulatorTicketsPaid,
          calculationMethod: ticketCalc.method,
          calculationConfidence: ticketCalc.confidence
        };
        
        console.log(`[AGGREGATOR] Ticket value calculated: $${ticketCalc.value} via ${ticketCalc.method}`);
      }
    }
    
    // Step 4: Update game with aggregated data
    const updateResult = await updateGameWithSocialData(gameId, aggregation, { overridePrizepool });
    
    // Step 5: Create PlayerTickets if enabled and we have ticket info
    let playerTicketResult = null;
    if (createPlayerTickets && aggregation.hasAccumulatorTickets && aggregation.accumulatorTicketValue) {
      playerTicketResult = await upsertPlayerTickets(game, aggregation);
    }
    
    // Step 6: Trigger financials recalculation if needed
    let financialsResult = null;
    if (triggerFinancials && (aggregation.hasAccumulatorTickets || aggregation.hasJackpotContributions)) {
      financialsResult = await triggerFinancialsRecalculation(gameId);
    }
    
    return {
      success: true,
      gameId,
      linkedPostCount: aggregation.linkedSocialPostCount,
      resultPostCount: aggregation.resultPostIds.length,
      promoPostCount: aggregation.promoPostIds.length,
      dataExtracted: {
        hasAccumulatorTickets: aggregation.hasAccumulatorTickets,
        hasJackpotContributions: aggregation.hasJackpotContributions,
        hasPlacements: aggregation.placements.length > 0,
        hasPrizepool: !!aggregation.socialPrizepoolPaid,
        ticketValueCalculated: !!aggregation.ticketValueCalculation,
        hasReconciliationDiscrepancy: aggregation.hasReconciliationDiscrepancy,
        totalTicketsExtracted: aggregation.totalTicketsExtracted,
        ticketCountByType: aggregation.ticketCountByType
      },
      ticketValueCalculation: aggregation.ticketValueCalculation,
      playerTickets: playerTicketResult,
      financialsRecalculation: financialsResult,
      aggregation: returnAggregation ? aggregation : undefined,
      processingTimeMs: Date.now() - startTime
    };
    
  } catch (error) {
    console.error(`[AGGREGATOR] Error processing game ${gameId}:`, error);
    return {
      success: false,
      gameId,
      error: error.message,
      processingTimeMs: Date.now() - startTime
    };
  }
};

// ===================================================================
// LAMBDA HANDLER - STREAM EVENTS
// ===================================================================

const handleStreamEvent = async (event) => {
  console.log(`[AGGREGATOR] Processing ${event.Records?.length || 0} stream records`);
  
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    ticketsCreated: 0,
    gamesWithDiscrepancies: 0,
    gameIds: new Set()
  };
  
  for (const record of event.Records || []) {
    const eventName = record.eventName;
    
    if (!['INSERT', 'MODIFY'].includes(eventName)) {
      results.skipped++;
      continue;
    }
    
    try {
      const linkImage = record.dynamodb?.NewImage;
      if (!linkImage) {
        results.skipped++;
        continue;
      }
      
      const link = unmarshall(linkImage);
      
      if (link.linkType === 'REJECTED') {
        results.skipped++;
        continue;
      }
      
      const gameId = link.gameId;
      if (!gameId || results.gameIds.has(gameId)) {
        results.skipped++;
        continue;
      }
      results.gameIds.add(gameId);
      
      const processResult = await processSocialDataForGame(gameId, {
        triggerFinancials: true,
        createPlayerTickets: true,
        returnAggregation: false
      });
      
      if (processResult.success) {
        results.processed++;
        if (processResult.playerTickets?.created) {
          results.ticketsCreated += processResult.playerTickets.created;
        }
        if (processResult.dataExtracted?.hasReconciliationDiscrepancy) {
          results.gamesWithDiscrepancies++;
        }
      } else {
        results.errors++;
      }
      
    } catch (error) {
      console.error('[AGGREGATOR] Error processing record:', error);
      results.errors++;
    }
  }
  
  console.log(`[AGGREGATOR] Stream complete: ${results.processed} processed, ${results.ticketsCreated} tickets created, ${results.gamesWithDiscrepancies} discrepancies, ${results.skipped} skipped, ${results.errors} errors`);
  
  return {
    ...results,
    gameIds: Array.from(results.gameIds)
  };
};

// ===================================================================
// LAMBDA HANDLER - MAIN
// ===================================================================

exports.handler = async (event, context) => {
  console.log('[AGGREGATOR] Handler invoked');
  console.log('[AGGREGATOR] Event:', JSON.stringify(event, null, 2));
  
  if (event.Records && Array.isArray(event.Records)) {
    return await handleStreamEvent(event);
  }
  
  const { typeName, fieldName, arguments: args } = event;
  const input = args?.input || event.input || event;
  
  try {
    switch (fieldName) {
      case 'aggregateSocialDataForGame':
        return await processSocialDataForGame(input.gameId, input.options || {});
        
      case 'batchAggregateSocialData':
        const gameIds = input.gameIds || [];
        const batchResults = [];
        let totalDiscrepancies = 0;
        
        for (const gId of gameIds) {
          const result = await processSocialDataForGame(gId, input.options || {});
          batchResults.push(result);
          if (result.dataExtracted?.hasReconciliationDiscrepancy) {
            totalDiscrepancies++;
          }
        }
        return {
          totalRequested: gameIds.length,
          processed: batchResults.filter(r => r.success).length,
          failed: batchResults.filter(r => !r.success).length,
          ticketsCreated: batchResults.reduce((sum, r) => sum + (r.playerTickets?.created || 0), 0),
          gamesWithDiscrepancies: totalDiscrepancies,
          results: batchResults
        };
        
      default:
        if (input.gameId) {
          return await processSocialDataForGame(input.gameId, input.options || {});
        }
        throw new Error(`Unknown operation or missing gameId`);
    }
  } catch (error) {
    console.error('[AGGREGATOR] Handler error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  handler: exports.handler,
  processSocialDataForGame,
  aggregateSocialDataForGame,
  updateGameWithSocialData,
  calculateTicketValue,
  upsertPlayerTickets,
  extractTicketAggregatesFromData,
  extractTicketDataFromLink,
  extractTicketAwardsFromContent,
  extractJackpotInfo,
  countTicketsFromPlacements,
  parsePlacements,
  roundUpToNearest,
  ACCUMULATOR_TICKET_TYPES,
  VALID_TICKET_TYPES
};