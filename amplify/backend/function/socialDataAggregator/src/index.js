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
 * VERSION: 2.0.0
 * 
 * PURPOSE:
 * Aggregates data from linked social posts to enrich Game records.
 * Handles prizepool payouts, ticket awards, bad beat jackpots, and other
 * data that only appears in social media posts (not on the tournament page).
 * 
 * NEW IN v2.0.0:
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
 * 4. Calculate ticket values if needed
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
 * @param {number} value - Value to round
 * @param {number} increment - Increment to round to (default: 10)
 * @returns {number} Rounded value
 */
const roundUpToNearest = (value, increment = 10) => {
  return Math.ceil(value / increment) * increment;
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
 * Get extracted game data for a social post
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
  const { programName, value, entityId, originGameId, validityDays = 365 } = templateData;
  
  // Try to find existing template by name and value
  // Note: In production, you'd want a GSI for this query
  // For now, we'll create a deterministic ID based on program name
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
    description: `Accumulator ticket for ${programName} worth $${value}`,
    value: value,
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
  
  // Query by player and filter by wonFromGameId and templateId
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
// PLACEMENT & PRIZE EXTRACTION
// ===================================================================

/**
 * Parse placements from extracted data
 * Handles various formats of placement data from social posts
 * 
 * @param {string|Array} extractedPlacements - Raw placement data
 * @returns {Array} Normalized placement objects
 */
const parsePlacements = (extractedPlacements) => {
  if (!extractedPlacements) return [];
  
  // If it's already an array, use it
  if (Array.isArray(extractedPlacements)) {
    return extractedPlacements;
  }
  
  // If it's a JSON string, parse it
  if (typeof extractedPlacements === 'string') {
    try {
      const parsed = JSON.parse(extractedPlacements);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[AGGREGATOR] Could not parse placements string:', extractedPlacements);
      return [];
    }
  }
  
  return [];
};

/**
 * Count ticket awards from parsed placements
 * Uses the placementParser's detection of ACCUMULATOR_TICKET in nonCashPrizes
 * 
 * The placementParser marks placements with tickets as:
 * {
 *   place: 1,
 *   playerName: "John Smith",
 *   hasNonCashPrize: true,
 *   nonCashPrizes: [{ prizeType: 'ACCUMULATOR_TICKET', ... }]
 * }
 * 
 * @param {Array} placements - Parsed placements from SocialPostGameData
 * @returns {Object} { count, positions, placements }
 */
const countTicketsFromPlacements = (placements) => {
  const result = {
    count: 0,
    positions: [],
    ticketPlacements: []
  };
  
  if (!placements || placements.length === 0) {
    return result;
  }
  
  for (const placement of placements) {
    // Check if this placement has an accumulator ticket
    const hasTicket = placement.hasNonCashPrize && 
      placement.nonCashPrizes?.some(np => {
        // Handle both parsed objects and JSON strings
        const prizes = typeof np === 'string' ? JSON.parse(np) : 
                       Array.isArray(placement.nonCashPrizes) ? placement.nonCashPrizes : [];
        
        if (typeof np === 'object' && np.prizeType === 'ACCUMULATOR_TICKET') {
          return true;
        }
        return false;
      });
    
    // Also check for asterisk markers which indicate tickets
    const hasAsterisk = placement.rawText?.includes('*') || 
                        placement.cashPrizeRaw?.includes('*');
    
    if (hasTicket || hasAsterisk) {
      result.count++;
      result.positions.push(placement.place);
      result.ticketPlacements.push({
        place: placement.place,
        playerName: placement.playerName,
        cashPrize: placement.cashPrize
      });
    }
  }
  
  // Sort positions
  result.positions.sort((a, b) => a - b);
  
  console.log(`[AGGREGATOR] Found ${result.count} ticket awards from placements at positions: ${result.positions.join(', ')}`);
  
  return result;
};

/**
 * Extract ticket awards from social post content and extracted data
 * 
 * Common patterns:
 * - "Top 9 will receive $250 Sydney Millions credit"
 * - "Prizepool includes 9 x $250 Sydney Millions credit"
 * - "Also awarding 5 x $100 accumulator tickets"
 * 
 * @param {Object} socialPost - The social post
 * @param {Object} extractedData - The SocialPostGameData
 * @returns {Object} Ticket award information
 */
const extractTicketAwards = (socialPost, extractedData) => {
  const result = {
    hasAccumulatorTickets: false,
    accumulatorTicketValue: null,
    numberOfAccumulatorTicketsPaid: null,
    ticketAwardDetails: null,
    ticketProgramName: null,
    ticketAwardPositions: null  // Which positions get tickets
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
      source: 'social_post_content'
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
      source: 'social_post_content'
    };
    return result;
  }
  
  // Pattern 3: Just detect count without value (we'll calculate later)
  // "Top 9 finishers also receive accumulator credits"
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
      value: null, // To be calculated
      positions: result.ticketAwardPositions,
      source: 'social_post_content',
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
  
  // Pattern: "BADBEAT Jackpot: $16377.2"
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
 * 
 * Formula: (prizepoolPaid - prizepoolCalculated) / numberOfTickets
 * Rounded UP to nearest $10
 * 
 * This works because:
 * - prizepoolPaid = actual cash + ticket values paid out
 * - prizepoolCalculated = what players contributed (cash only)
 * - The difference = added value, which includes ticket values
 * 
 * @param {Object} game - Game record
 * @param {number} numberOfTickets - Number of tickets awarded
 * @returns {Object} Calculation result
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
  
  // Method 2: Use guaranteeAmount - prizepoolCalculated if prizepoolPaid not available
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
  
  // Method 3: Check if we have prizepoolAddedValue
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
 * 
 * @param {Object} game - The game record
 * @param {Object} aggregation - Aggregation with ticket info
 * @returns {Object} Upsert result
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
  
  console.log(`[AGGREGATOR] Processing ${ticketCount} ticket awards for positions: ${ticketPositions.join(', ')}`);
  
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
    originGameId: game.recurringGameId || game.id
  });
  
  // Calculate expiry date (default 365 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (template.validityDays || 365));
  
  const tableName = getTableName('PlayerTicket');
  const now = new Date().toISOString();
  
  // Process each ticket-eligible position
  for (const position of ticketPositions) {
    // Find player result at this position
    const playerResult = playerResults.find(pr => pr.finishingPlace === position);
    
    if (!playerResult || !playerResult.playerId) {
      console.log(`[AGGREGATOR] No player found at position ${position}`);
      result.skipped++;
      continue;
    }
    
    try {
      // Check for existing ticket
      const existingTicket = await getExistingPlayerTicket(
        playerResult.playerId,
        game.id,
        template.id
      );
      
      if (existingTicket) {
        // Update existing ticket if needed
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
      
      // Create new ticket
      const ticketId = uuidv4();
      const newTicket = {
        id: ticketId,
        playerId: playerResult.playerId,
        ticketTemplateId: template.id,
        
        // NEW FIELDS - track source
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
        ticketValue: ticketValue,
        programName: programName,
        awardReason: `Finished ${position}${getOrdinalSuffix(position)} place`,
        
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
        value: ticketValue,
        action: 'CREATED'
      });
      
      console.log(`[AGGREGATOR] Created ticket ${ticketId} for player ${playerResult.playerId} (${position}${getOrdinalSuffix(position)} place)`);
      
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

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
const getOrdinalSuffix = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

// ===================================================================
// AGGREGATION LOGIC
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
    
    const extractedData = socialPost.extractedGameDataId 
      ? await getExtractedGameData(socialPost.extractedGameDataId)
      : null;
    
    postDataCollection.push({
      link,
      socialPost,
      extractedData,
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
    
    // Placement data
    placements: [],
    placementCount: 0,
    firstPlacePrize: null,
    
    // Ticket awards
    hasAccumulatorTickets: false,
    accumulatorTicketValue: null,
    numberOfAccumulatorTicketsPaid: null,
    ticketAwardDetails: null,
    ticketProgramName: null,
    ticketAwardPositions: null,
    ticketValueCalculation: null,
    
    // Jackpot
    hasJackpotContributions: false,
    jackpotContributionAmount: null,
    
    // Entries (from social posts)
    socialTotalEntries: null,
    
    // Metadata
    aggregatedAt: new Date().toISOString(),
    sourcePostIds: links.map(l => l.socialPostId),
    resultPostIds: [],
    promoPostIds: []
  };
  
  // Process each post
  for (const item of postDataCollection) {
    const { socialPost, extractedData, isResult, isPromo } = item;
    
    // Track post types
    if (isResult) {
      aggregation.resultPostIds.push(socialPost.id);
      if (!aggregation.primaryResultPostId) {
        aggregation.primaryResultPostId = socialPost.id;
      }
    } else if (isPromo) {
      aggregation.promoPostIds.push(socialPost.id);
    }
    
    // Extract data from post
    if (extractedData) {
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
      
      const placements = parsePlacements(extractedData.extractedPlacements);
      if (placements.length > 0 && aggregation.placements.length === 0) {
        aggregation.placements = placements;
        aggregation.placementCount = placements.length;
        
        // COUNT TICKETS FROM PLACEMENTS (using placementParser's detection)
        // This is the most reliable source as it detects per-placement tickets
        const ticketCountFromPlacements = countTicketsFromPlacements(placements);
        if (ticketCountFromPlacements.count > 0 && !aggregation.hasAccumulatorTickets) {
          aggregation.hasAccumulatorTickets = true;
          aggregation.numberOfAccumulatorTicketsPaid = ticketCountFromPlacements.count;
          aggregation.ticketAwardPositions = ticketCountFromPlacements.positions;
          aggregation.ticketAwardDetails = {
            quantity: ticketCountFromPlacements.count,
            positions: ticketCountFromPlacements.positions,
            placements: ticketCountFromPlacements.ticketPlacements,
            source: 'placement_parser',
            valueNeedsCalculation: true
          };
          console.log(`[AGGREGATOR] Set ticket count from placements: ${ticketCountFromPlacements.count}`);
        }
      }
    }
    
    // Extract ticket awards from post content (fallback if not found in placements)
    // This catches patterns like "Top 9 will receive $250 Sydney Millions credit"
    if (!aggregation.hasAccumulatorTickets) {
      const ticketInfo = extractTicketAwards(socialPost, extractedData);
      if (ticketInfo.hasAccumulatorTickets) {
        aggregation.hasAccumulatorTickets = true;
        aggregation.numberOfAccumulatorTicketsPaid = ticketInfo.numberOfAccumulatorTicketsPaid;
        aggregation.ticketProgramName = ticketInfo.ticketProgramName;
        aggregation.ticketAwardPositions = ticketInfo.ticketAwardPositions;
        
        // Set value if we have it from the content pattern
        if (ticketInfo.accumulatorTicketValue) {
          aggregation.accumulatorTicketValue = ticketInfo.accumulatorTicketValue;
          aggregation.ticketAwardDetails = ticketInfo.ticketAwardDetails;
        } else {
          aggregation.ticketAwardDetails = {
            quantity: ticketInfo.numberOfAccumulatorTicketsPaid,
            positions: ticketInfo.ticketAwardPositions,
            source: 'social_post_content',
            valueNeedsCalculation: true
          };
        }
        console.log(`[AGGREGATOR] Set ticket count from content pattern: ${ticketInfo.numberOfAccumulatorTicketsPaid}`);
      }
    } else if (aggregation.hasAccumulatorTickets && !aggregation.accumulatorTicketValue) {
      // We have ticket count from placements, but try to get value from content
      const ticketInfo = extractTicketAwards(socialPost, extractedData);
      if (ticketInfo.accumulatorTicketValue) {
        aggregation.accumulatorTicketValue = ticketInfo.accumulatorTicketValue;
        aggregation.ticketProgramName = ticketInfo.ticketProgramName || aggregation.ticketProgramName;
        if (aggregation.ticketAwardDetails) {
          aggregation.ticketAwardDetails.value = ticketInfo.accumulatorTicketValue;
          aggregation.ticketAwardDetails.totalValue = ticketInfo.accumulatorTicketValue * aggregation.numberOfAccumulatorTicketsPaid;
          aggregation.ticketAwardDetails.valueNeedsCalculation = false;
          aggregation.ticketAwardDetails.valueSource = 'social_post_content';
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
  
  return aggregation;
};

// ===================================================================
// GAME UPDATE
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
        ticketValueCalculated: !!aggregation.ticketValueCalculation
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
      } else {
        results.errors++;
      }
      
    } catch (error) {
      console.error('[AGGREGATOR] Error processing record:', error);
      results.errors++;
    }
  }
  
  console.log(`[AGGREGATOR] Stream complete: ${results.processed} processed, ${results.ticketsCreated} tickets created, ${results.skipped} skipped, ${results.errors} errors`);
  
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
        for (const gId of gameIds) {
          const result = await processSocialDataForGame(gId, input.options || {});
          batchResults.push(result);
        }
        return {
          totalRequested: gameIds.length,
          processed: batchResults.filter(r => r.success).length,
          failed: batchResults.filter(r => !r.success).length,
          ticketsCreated: batchResults.reduce((sum, r) => sum + (r.playerTickets?.created || 0), 0),
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
  extractTicketAwards,
  extractJackpotInfo,
  parsePlacements,
  roundUpToNearest
};