/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMECOSTITEMTABLE_ARN
    API_KINGSROOM_GAMECOSTITEMTABLE_NAME
    API_KINGSROOM_GAMECOSTLINEITEMTABLE_ARN
    API_KINGSROOM_GAMECOSTLINEITEMTABLE_NAME
    API_KINGSROOM_GAMECOSTTABLE_ARN
    API_KINGSROOM_GAMECOSTTABLE_NAME
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_ARN
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_NAME
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
    API_KINGSROOM_RECURRINGGAMETABLE_ARN
    API_KINGSROOM_RECURRINGGAMETABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * GAME FINANCIALS PROCESSOR LAMBDA
 * ===================================================================
 * 
 * VERSION: 2.0.0
 * 
 * CHANGELOG:
 * - v2.0.0: Added totalGuaranteeOverlayCost support
 *           - totalGuaranteeOverlayCost now included in totalCost calculation
 *           - costPerPlayer now reflects total cost including overlay
 *           - Clear separation between overlay cost and promotional added value
 *           - totalPrizeContribution = promotional added value (NOT overlay)
 *           - Added guaranteeOverlayPerPlayer metric
 * - v1.5.0: Added content hash check to skip non-meaningful Game table changes
 *           Only processes records where dataChangedAt changed
 * - v1.4.0: Updates Game.gameCostId and Game.gameFinancialSnapshotId after saving
 * - v1.3.0: Added tournamentSeriesId, seriesName, recurringGameId for metrics
 * - v1.2.0: Added isSeries and isSeriesParent flags for filtering/aggregation
 * 
 * TRIGGERS:
 * - DynamoDB Streams on Game table (INSERT, MODIFY events) → auto-saves
 * - GraphQL mutation (preview or save mode)
 * - Direct Lambda invocation (preview or save mode)
 * 
 * NO PLAYER DATA MODIFICATION - Only updates GameCost, GameFinancialSnapshot,
 * and Game FK fields.
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error('API ID or environment name not found in environment variables.');
    }
    const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
    if (process.env[envVarName]) return process.env[envVarName];
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Check if game record should trigger financial processing
 */
const shouldProcessGame = (game, eventName) => {
    if (!game || !game.id) return false;
    if (game.gameStatus === 'NOT_PUBLISHED') return false;
    if (!game.entityId) return false;
    return ['INSERT', 'MODIFY'].includes(eventName);
};

/**
 * Determine if a game is part of a tournament series
 */
const determineIsSeries = (game) => {
    return !!(game.isSeries === true || game.tournamentSeriesId);
};

/**
 * Determine if a game is a series parent (consolidated record)
 */
const determineIsSeriesParent = (game) => {
    const isSeries = determineIsSeries(game);
    return isSeries && !game.parentGameId;
};

// ===================================================================
// CONTENT HASH CHECK - Skip non-meaningful changes
// ===================================================================

/**
 * Check if this stream record represents a meaningful change
 * that requires financial processing.
 * 
 * @param {Object} record - DynamoDB stream record
 * @returns {Object} { shouldProcess: boolean, reason: string }
 */
const shouldProcessStreamRecord = (record) => {
    const { eventName, dynamodb } = record;
    
    // Always process INSERT events (new games)
    if (eventName === 'INSERT') {
        return { shouldProcess: true, reason: 'New game inserted' };
    }
    
    // Skip REMOVE events (no financials for deleted games)
    if (eventName === 'REMOVE') {
        return { shouldProcess: false, reason: 'Game removed' };
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
};

// ===================================================================
// COST CALCULATION
// ===================================================================

/**
 * Calculate GameCost data
 * 
 * v2.0.0: Added totalGuaranteeOverlayCost (from game.guaranteeOverlayCost)
 *         Added totalAddedValueCost (from game.prizepoolAddedValue - promotional only)
 *         These are now DISTINCT costs:
 *         - totalGuaranteeOverlayCost: Unplanned cost from not meeting guarantee
 *         - totalAddedValueCost: Planned promotional expense
 *         - totalPrizeContribution: Legacy field, now equals totalAddedValueCost
 */
const calculateGameCost = (game, existingCost = null) => {
    const totalEntries = game.totalEntries || 0;
    const dealerRatePerEntry = 15;
    const computedDealerCost = totalEntries * dealerRatePerEntry;
    
    // Preserve existing manual cost entries
    const totalTournamentDirectorCost = existingCost?.totalTournamentDirectorCost || 0;
    const totalFloorStaffCost = existingCost?.totalFloorStaffCost || 0;
    const totalSecurityCost = existingCost?.totalSecurityCost || 0;
    const totalJackpotContribution = existingCost?.totalJackpotContribution || 0;
    const totalPromotionCost = existingCost?.totalPromotionCost || 0;
    const totalOtherCost = existingCost?.totalOtherCost || 0;
    const totalBountyCost = existingCost?.totalBountyCost || 0;
    const totalVenueRentalCost = existingCost?.totalVenueRentalCost || 0;
    const totalEquipmentRentalCost = existingCost?.totalEquipmentRentalCost || 0;
    const totalFoodBeverageCost = existingCost?.totalFoodBeverageCost || 0;
    const totalMarketingCost = existingCost?.totalMarketingCost || 0;
    const totalStreamingCost = existingCost?.totalStreamingCost || 0;
    const totalInsuranceCost = existingCost?.totalInsuranceCost || 0;
    const totalLicensingCost = existingCost?.totalLicensingCost || 0;
    const totalStaffTravelCost = existingCost?.totalStaffTravelCost || 0;
    const totalPlayerAccommodationCost = existingCost?.totalPlayerAccommodationCost || 0;
    
    // ===================================================================
    // OVERLAY AND ADDED VALUE COSTS (NEW in v2.0.0)
    // ===================================================================
    
    // totalGuaranteeOverlayCost: Unplanned cost from not meeting guarantee
    // This comes from the enricher's guaranteeOverlayCost calculation
    const totalGuaranteeOverlayCost = game.guaranteeOverlayCost || 0;
    
    // totalAddedValueCost: Planned promotional expense (e.g., "+$5k added prizepool")
    // This comes from prizepoolAddedValue which is NOW SEPARATE from overlay
    const totalAddedValueCost = game.prizepoolAddedValue || 0;
    
    // totalPrizeContribution: Legacy field for promotional added value
    // Now explicitly equals totalAddedValueCost (NOT overlay)
    const totalPrizeContribution = totalAddedValueCost;
    
    // ===================================================================
    // STAFF COST AGGREGATION
    // ===================================================================
    
    const totalStaffCost = computedDealerCost + 
        totalTournamentDirectorCost + 
        totalFloorStaffCost + 
        totalSecurityCost;
    
    // ===================================================================
    // DIRECT GAME COSTS (excludes overlay - that's unplanned)
    // ===================================================================
    
    const totalDirectGameCost = totalStaffCost + 
        totalPrizeContribution + 
        totalJackpotContribution + 
        totalBountyCost;
    
    // ===================================================================
    // OPERATIONS COSTS
    // ===================================================================
    
    const totalOperationsCost = totalVenueRentalCost + 
        totalEquipmentRentalCost + 
        totalFoodBeverageCost;
    
    // ===================================================================
    // COMPLIANCE COSTS
    // ===================================================================
    
    const totalComplianceCost = totalInsuranceCost + totalLicensingCost;
    
    // ===================================================================
    // TOTAL COST - NOW INCLUDES OVERLAY COST
    // ===================================================================
    
    // Total cost includes ALL costs including guarantee overlay
    const totalCost = totalStaffCost +
        totalPrizeContribution +        // Promotional added value
        totalJackpotContribution +
        totalBountyCost +
        totalVenueRentalCost +
        totalEquipmentRentalCost +
        totalFoodBeverageCost +
        totalMarketingCost +
        totalStreamingCost +
        totalInsuranceCost +
        totalLicensingCost +
        totalStaffTravelCost +
        totalPlayerAccommodationCost +
        totalPromotionCost +
        totalOtherCost +
        totalGuaranteeOverlayCost;      // OVERLAY COST NOW INCLUDED
    
    return {
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId,
        gameDate: game.gameStartDateTime,
        
        // Staff costs
        totalDealerCost: computedDealerCost,
        totalTournamentDirectorCost,
        totalFloorStaffCost,
        totalSecurityCost,
        totalStaffCost,
        
        // Direct game costs
        totalPrizeContribution,         // Promotional added value only
        totalJackpotContribution,
        totalBountyCost,
        totalDirectGameCost,
        
        // Overlay cost (v2.0.0 - separated from added value)
        totalGuaranteeOverlayCost,      // Unplanned overlay cost
        totalAddedValueCost,            // Planned promotional expense
        
        // Operations costs
        totalVenueRentalCost,
        totalEquipmentRentalCost,
        totalFoodBeverageCost,
        totalOperationsCost,
        
        // Marketing costs
        totalMarketingCost,
        totalStreamingCost,
        
        // Compliance costs
        totalInsuranceCost,
        totalLicensingCost,
        totalComplianceCost,
        
        // Other costs
        totalStaffTravelCost,
        totalPlayerAccommodationCost,
        totalPromotionCost,
        totalOtherCost,
        
        // Totals
        totalCost,
        
        // Calculation metadata
        dealerRatePerEntry,
        entriesUsedForCalculation: totalEntries
    };
};

// ===================================================================
// FINANCIAL SNAPSHOT CALCULATION
// ===================================================================

/**
 * Calculate GameFinancialSnapshot data
 * 
 * v2.0.0: 
 * - totalGuaranteeOverlayCost now included in totalCost
 * - costPerPlayer reflects total cost including overlay
 * - Clear separation between overlay and promotional added value
 */
const calculateGameFinancialSnapshot = (game, costData) => {
    // Revenue metrics
    const rakeRevenue = game.rakeRevenue || 0;
    const venueFee = game.venueFee || 0;
    const totalBuyInsCollected = game.totalBuyInsCollected || 0;
    const totalRevenue = rakeRevenue + venueFee;
    
    // Prizepool metrics
    const prizepoolPlayerContributions = game.prizepoolPlayerContributions || 0;
    
    // prizepoolAddedValue is now ONLY promotional added value (NOT overlay)
    const prizepoolAddedValue = game.prizepoolAddedValue || 0;
    
    // prizepoolTotal includes player contributions + overlay (paid) + promotional added value
    const prizepoolTotal = game.prizepoolPaid || game.prizepoolCalculated || (prizepoolPlayerContributions + (game.guaranteeOverlayCost || 0) + prizepoolAddedValue);
    const prizepoolSurplus = game.prizepoolSurplus || null;
    
    // Guarantee metrics
    const guaranteeAmount = game.guaranteeAmount || 0;
    const guaranteeOverlayCost = game.guaranteeOverlayCost || 0;
    const guaranteeMet = guaranteeOverlayCost === 0;
    const guaranteeCoverageRate = guaranteeAmount > 0 
        ? Math.round((prizepoolPlayerContributions / guaranteeAmount) * 100) / 100 
        : null;
    
    // ===================================================================
    // OVERLAY COST - NOW PROPERLY TRACKED
    // ===================================================================
    
    // totalGuaranteeOverlayCost: Unplanned cost from not meeting guarantee
    const totalGuaranteeOverlayCost = guaranteeOverlayCost;
    
    // totalAddedValueCost = prizepoolAddedValue (planned promotional expense)
    const totalAddedValueCost = prizepoolAddedValue;
    
    // totalPrizeContribution = promotional added value (NOT overlay)
    const totalPrizeContribution = prizepoolAddedValue;
    
    // ===================================================================
    // COST METRICS - NOW INCLUDES OVERLAY
    // ===================================================================
    
    // Total cost from GameCost calculation (already includes overlay in v2.0.0)
    const totalCost = costData?.totalCost || 0;
    const totalDealerCost = costData?.totalDealerCost || 0;
    const totalStaffCost = (costData?.totalDealerCost || 0) + 
                           (costData?.totalTournamentDirectorCost || 0) + 
                           (costData?.totalFloorStaffCost || 0);
    
    // ===================================================================
    // PROFIT CALCULATIONS
    // ===================================================================
    
    // gameProfit: Simple profit from enricher (rakeRevenue - guaranteeOverlayCost)
    const gameProfit = game.gameProfit || (rakeRevenue - guaranteeOverlayCost);
    
    // netProfit: Full profit calculation (revenue - all costs)
    // Note: guaranteeOverlayCost is now part of totalCost, so we don't subtract it again
    const netProfit = totalRevenue - totalCost;
    
    const profitMargin = totalRevenue > 0 
        ? Math.round((netProfit / totalRevenue) * 100) / 100 
        : null;
    
    // ===================================================================
    // PLAYER/ENTRY METRICS
    // ===================================================================
    
    const totalUniquePlayers = game.totalUniquePlayers || 0;
    const totalEntries = game.totalEntries || 0;
    
    // ===================================================================
    // PER-PLAYER METRICS - NOW INCLUDES OVERLAY IN COST
    // ===================================================================
    
    const revenuePerPlayer = totalUniquePlayers > 0 
        ? Math.round((totalRevenue / totalUniquePlayers) * 100) / 100 
        : null;
    
    // costPerPlayer now includes overlay cost (since it's in totalCost)
    const costPerPlayer = totalUniquePlayers > 0 
        ? Math.round((totalCost / totalUniquePlayers) * 100) / 100 
        : null;
    
    const profitPerPlayer = totalUniquePlayers > 0 
        ? Math.round((netProfit / totalUniquePlayers) * 100) / 100 
        : null;
    
    const rakePerEntry = totalEntries > 0 
        ? Math.round((rakeRevenue / totalEntries) * 100) / 100 
        : null;
    
    const staffCostPerPlayer = totalUniquePlayers > 0 
        ? Math.round((totalStaffCost / totalUniquePlayers) * 100) / 100 
        : null;
    
    // guaranteeOverlayPerPlayer: How much overlay cost per player (useful metric)
    const guaranteeOverlayPerPlayer = totalUniquePlayers > 0 && totalGuaranteeOverlayCost > 0
        ? Math.round((totalGuaranteeOverlayCost / totalUniquePlayers) * 100) / 100
        : null;
    
    // ===================================================================
    // DURATION METRICS
    // ===================================================================
    
    let gameDurationMinutes = null;
    if (game.gameStartDateTime && game.gameEndDateTime) {
        const start = new Date(game.gameStartDateTime);
        const end = new Date(game.gameEndDateTime);
        if (!isNaN(start) && !isNaN(end)) {
            gameDurationMinutes = Math.round((end - start) / (1000 * 60));
        }
    }
    
    const dealerCostPerHour = gameDurationMinutes && gameDurationMinutes > 0 
        ? Math.round((totalDealerCost / (gameDurationMinutes / 60)) * 100) / 100 
        : null;
    
    // ===================================================================
    // PRIZEPOOL ADJUSTMENTS
    // ===================================================================
    
    const prizepoolCalculated = game.prizepoolCalculated || 0;
    const prizepoolPaidDelta = (game.prizepoolPaid || 0) - prizepoolCalculated;
    
    const hasJackpotContributions = game.hasJackpotContributions || false;
    const jackpotContributionAmount = game.jackpotContributionAmount || 0;
    const prizepoolJackpotContributions = game.prizepoolJackpotContributions || 
        (hasJackpotContributions ? jackpotContributionAmount * totalEntries : 0);
    
    const hasAccumulatorTickets = game.hasAccumulatorTickets || false;
    const accumulatorTicketValue = game.accumulatorTicketValue || 100;
    const numberOfAccumulatorTicketsPaid = game.numberOfAccumulatorTicketsPaid || 
        (hasAccumulatorTickets ? Math.floor(totalEntries * 0.10) : 0);
    const prizepoolAccumulatorTicketPayoutEstimate = hasAccumulatorTickets 
        ? numberOfAccumulatorTicketsPaid * accumulatorTicketValue 
        : 0;
    
    // ===================================================================
    // SERIES FLAGS
    // ===================================================================
    
    const isSeries = determineIsSeries(game);
    const isSeriesParent = determineIsSeriesParent(game);
    
    // ===================================================================
    // LOGGING
    // ===================================================================
    
    if (totalGuaranteeOverlayCost > 0) {
        console.log(`[FINANCIALS SNAPSHOT] 💰 Game ${game.id} has overlay cost: $${totalGuaranteeOverlayCost}`);
        console.log(`[FINANCIALS SNAPSHOT]    - costPerPlayer now: $${costPerPlayer} (includes overlay)`);
        console.log(`[FINANCIALS SNAPSHOT]    - guaranteeOverlayPerPlayer: $${guaranteeOverlayPerPlayer}`);
    }
    
    return {
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId,
        gameStartDateTime: game.gameStartDateTime,
        
        // Denormalized game data
        totalUniquePlayers,
        totalEntries,
        guaranteeAmount,
        gameDurationMinutes,
        gameType: game.gameType,
        tournamentType: game.tournamentType,
        
        // Revenue
        totalBuyInsCollected,
        rakeRevenue,
        venueFee,
        totalRevenue,
        
        // Prizepool
        prizepoolPlayerContributions,
        prizepoolAddedValue,            // Promotional added value only
        prizepoolTotal,
        prizepoolSurplus,
        prizepoolPaidDelta,
        prizepoolJackpotContributions,
        prizepoolAccumulatorTicketPayoutEstimate,
        prizepoolAccumulatorTicketPayoutActual: game.prizepoolAccumulatorTicketPayoutActual || null,
        
        // Guarantee
        guaranteeOverlayCost,
        guaranteeCoverageRate,
        guaranteeMet,
        
        // ===================================================================
        // COSTS (v2.0.0 - Now properly includes overlay)
        // ===================================================================
        totalCost,                      // Includes overlay cost
        totalDealerCost,
        totalStaffCost,
        totalTournamentDirectorCost: costData?.totalTournamentDirectorCost || 0,
        totalFloorStaffCost: costData?.totalFloorStaffCost || 0,
        totalSecurityCost: costData?.totalSecurityCost || 0,
        
        // Overlay and added value (v2.0.0 - properly separated)
        totalGuaranteeOverlayCost,      // Unplanned cost from not meeting guarantee
        totalAddedValueCost,            // Planned promotional expense
        totalPrizeContribution,         // = totalAddedValueCost (NOT overlay)
        
        // Other cost breakdowns
        totalJackpotContribution: costData?.totalJackpotContribution || 0,
        totalBountyCost: costData?.totalBountyCost || 0,
        totalDirectGameCost: costData?.totalDirectGameCost || 0,
        totalVenueRentalCost: costData?.totalVenueRentalCost || 0,
        totalEquipmentRentalCost: costData?.totalEquipmentRentalCost || 0,
        totalFoodBeverageCost: costData?.totalFoodBeverageCost || 0,
        totalOperationsCost: costData?.totalOperationsCost || 0,
        totalMarketingCost: costData?.totalMarketingCost || 0,
        totalStreamingCost: costData?.totalStreamingCost || 0,
        totalInsuranceCost: costData?.totalInsuranceCost || 0,
        totalLicensingCost: costData?.totalLicensingCost || 0,
        totalComplianceCost: costData?.totalComplianceCost || 0,
        totalStaffTravelCost: costData?.totalStaffTravelCost || 0,
        totalPlayerAccommodationCost: costData?.totalPlayerAccommodationCost || 0,
        totalPromotionCost: costData?.totalPromotionCost || 0,
        totalOtherCost: costData?.totalOtherCost || 0,
        
        // Profit
        gameProfit,
        netProfit,
        profitMargin,
        
        // Per-player metrics (v2.0.0 - costPerPlayer now includes overlay)
        revenuePerPlayer,
        costPerPlayer,                  // Now includes overlay cost
        profitPerPlayer,
        rakePerEntry,
        staffCostPerPlayer,
        dealerCostPerHour,
        guaranteeOverlayPerPlayer,      // NEW: Overlay cost per player
        
        // Series flags
        isSeries,
        isSeriesParent,
        parentGameId: game.parentGameId || null,
        
        // Series identification
        tournamentSeriesId: game.tournamentSeriesId || null,
        seriesName: game.seriesName || null,
        
        // Recurring game reference
        recurringGameId: game.recurringGameId || null,
        
        // Composite query keys
        entitySeriesKey: game.entityId ? `${game.entityId}#${isSeries ? 'SERIES' : 'REGULAR'}` : null,
        venueSeriesKey: game.venueId ? `${game.venueId}#${isSeries ? 'SERIES' : 'REGULAR'}` : null
    };
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Fetch existing GameCost for a game
 */
const getExistingGameCost = async (gameId) => {
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: getTableName('GameCost'),
            IndexName: 'byGameCost',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        return result.Items?.[0] || null;
    } catch (error) {
        console.error(`[FINANCIALS] Error fetching existing GameCost:`, error);
        return null;
    }
};

/**
 * Save or update GameCost
 */
const saveGameCost = async (costData, existingCost) => {
    const now = new Date().toISOString();
    const tableName = getTableName('GameCost');
    
    try {
        const costId = existingCost?.id || uuidv4();
        const item = {
            ...costData,
            id: costId,
            __typename: 'GameCost',
            createdAt: existingCost?.createdAt || now,
            updatedAt: now
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: item
        }));
        
        console.log(`[FINANCIALS] ${existingCost ? 'Updated' : 'Created'} GameCost: ${costId}`);
        
        return {
            action: existingCost ? 'UPDATED' : 'CREATED',
            costId
        };
    } catch (error) {
        console.error(`[FINANCIALS] Error saving GameCost:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

/**
 * Save or update GameFinancialSnapshot
 */
const saveGameFinancialSnapshot = async (snapshotData, costSaveResult) => {
    const now = new Date().toISOString();
    const tableName = getTableName('GameFinancialSnapshot');
    
    try {
        // Check for existing snapshot
        const existingQuery = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGameFinancialSnapshot',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': snapshotData.gameId }
        }));
        const existingSnapshot = existingQuery.Items?.[0];
        
        const snapshotId = existingSnapshot?.id || uuidv4();
        const item = {
            ...snapshotData,
            id: snapshotId,
            gameCostId: costSaveResult?.costId,
            __typename: 'GameFinancialSnapshot',
            createdAt: existingSnapshot?.createdAt || now,
            updatedAt: now
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: item
        }));
        
        console.log(`[FINANCIALS] ${existingSnapshot ? 'Updated' : 'Created'} GameFinancialSnapshot: ${snapshotId}`);
        
        return {
            action: existingSnapshot ? 'UPDATED' : 'CREATED',
            snapshotId
        };
    } catch (error) {
        console.error(`[FINANCIALS] Error saving GameFinancialSnapshot:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

/**
 * Update Game record with foreign key references
 */
const updateGameFinancialForeignKeys = async (gameId, costSaveResult, snapshotSaveResult) => {
    if (!costSaveResult?.costId && !snapshotSaveResult?.snapshotId) {
        return { action: 'SKIPPED', reason: 'No IDs to update' };
    }
    
    try {
        const updateExpression = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};
        
        if (costSaveResult?.costId) {
            updateExpression.push('#gameCostId = :gameCostId');
            expressionAttributeNames['#gameCostId'] = 'gameCostId';
            expressionAttributeValues[':gameCostId'] = costSaveResult.costId;
        }
        
        if (snapshotSaveResult?.snapshotId) {
            updateExpression.push('#gameFinancialSnapshotId = :gameFinancialSnapshotId');
            expressionAttributeNames['#gameFinancialSnapshotId'] = 'gameFinancialSnapshotId';
            expressionAttributeValues[':gameFinancialSnapshotId'] = snapshotSaveResult.snapshotId;
        }
        
        // Always update updatedAt
        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: getTableName('Game'),
            Key: { id: gameId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[FINANCIALS] Updated Game ${gameId} with FK references`);
        
        return { action: 'UPDATED', gameId };
    } catch (error) {
        console.error(`[FINANCIALS] Error updating Game FKs:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

// ===================================================================
// PROCESS GAME FINANCIALS
// ===================================================================

/**
 * Process financials for a single game
 */
const processGameFinancials = async (game, options = {}) => {
    const startTime = Date.now();
    const { saveToDatabase = false } = options;
    
    console.log(`[FINANCIALS] Processing game: ${game.id} (save: ${saveToDatabase})`);
    
    // Fetch existing cost to preserve manual entries
    const existingCost = await getExistingGameCost(game.id);
    
    // Calculate cost data
    const costData = calculateGameCost(game, existingCost);
    
    // Calculate snapshot data
    const snapshotData = calculateGameFinancialSnapshot(game, costData);
    
    const result = {
        success: true,
        gameId: game.id,
        mode: saveToDatabase ? 'SAVE' : 'PREVIEW',
        calculatedCost: costData,
        calculatedSnapshot: snapshotData,
        summary: {
            totalRevenue: snapshotData.totalRevenue,
            rakeRevenue: snapshotData.rakeRevenue,
            totalBuyInsCollected: snapshotData.totalBuyInsCollected,
            totalCost: snapshotData.totalCost,
            totalDealerCost: snapshotData.totalDealerCost,
            
            // Overlay and added value (v2.0.0)
            totalGuaranteeOverlayCost: snapshotData.totalGuaranteeOverlayCost,
            totalAddedValueCost: snapshotData.totalAddedValueCost,
            totalPrizeContribution: snapshotData.totalPrizeContribution,
            
            prizepoolTotal: snapshotData.prizepoolTotal,
            prizepoolPlayerContributions: snapshotData.prizepoolPlayerContributions,
            prizepoolAddedValue: snapshotData.prizepoolAddedValue,
            guaranteeMet: snapshotData.guaranteeMet,
            guaranteeOverlayCost: snapshotData.guaranteeOverlayCost,
            guaranteeCoverageRate: snapshotData.guaranteeCoverageRate,
            gameProfit: snapshotData.gameProfit,
            netProfit: snapshotData.netProfit,
            profitMargin: snapshotData.profitMargin,
            revenuePerPlayer: snapshotData.revenuePerPlayer,
            costPerPlayer: snapshotData.costPerPlayer,
            profitPerPlayer: snapshotData.profitPerPlayer,
            rakePerEntry: snapshotData.rakePerEntry,
            guaranteeOverlayPerPlayer: snapshotData.guaranteeOverlayPerPlayer,
            isSeries: snapshotData.isSeries,
            isSeriesParent: snapshotData.isSeriesParent,
            tournamentSeriesId: snapshotData.tournamentSeriesId,
            seriesName: snapshotData.seriesName,
            recurringGameId: snapshotData.recurringGameId
        },
        costSaveResult: null,
        snapshotSaveResult: null,
        gameFkUpdateResult: null,
        processingTimeMs: 0
    };
    
    if (saveToDatabase) {
        result.costSaveResult = await saveGameCost(costData, existingCost);
        result.snapshotSaveResult = await saveGameFinancialSnapshot(snapshotData, result.costSaveResult);
        result.gameFkUpdateResult = await updateGameFinancialForeignKeys(
            game.id, 
            result.costSaveResult, 
            result.snapshotSaveResult
        );
    }
    
    result.processingTimeMs = Date.now() - startTime;
    return result;
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[FINANCIALS] v2.0.0 - With totalGuaranteeOverlayCost in totalCost');
    
    // Check if this is a DynamoDB Stream event
    if (event.Records && Array.isArray(event.Records)) {
        return await handleStreamEvent(event);
    }
    
    // GraphQL or direct invocation
    const input = event.arguments?.input || event.input || event;
    const options = input.options || {};
    const saveToDatabase = options.saveToDatabase === true;
    
    try {
        let game = input.game;
        
        if (!game && input.gameId) {
            const gameTable = getTableName('Game');
            const result = await ddbDocClient.send(new GetCommand({
                TableName: gameTable,
                Key: { id: input.gameId }
            }));
            
            if (!result.Item) {
                return { success: false, error: `Game not found: ${input.gameId}` };
            }
            game = result.Item;
        }
        
        if (!game || !game.id) {
            return { success: false, error: 'Game data or gameId is required' };
        }
        
        if (game.gameStatus === 'NOT_PUBLISHED') {
            return { success: false, skipped: true, error: 'Game is NOT_PUBLISHED' };
        }
        
        return await processGameFinancials(game, { saveToDatabase });
        
    } catch (error) {
        console.error('[FINANCIALS] Handler error:', error);
        return { success: false, error: error.message };
    }
};

// ===================================================================
// STREAM HANDLER - DYNAMODB STREAMS
// ===================================================================

/**
 * Handle DynamoDB Stream events (always saves)
 * NOW: Checks for meaningful changes before processing
 */
const handleStreamEvent = async (event) => {
    const totalRecords = event.Records?.length || 0;
    console.log(`[FINANCIALS] Processing ${totalRecords} stream records`);
    
    const results = {
        processed: 0,
        skipped: 0,
        errors: 0,
        seriesGames: 0,
        recurringGames: 0,
        gamesWithOverlay: 0,
        details: []
    };
    
    for (const record of event.Records || []) {
        const eventName = record.eventName;
        
        // ═══════════════════════════════════════════════════════════════
        // CONTENT HASH CHECK: Skip non-meaningful changes
        // ═══════════════════════════════════════════════════════════════
        const processCheck = shouldProcessStreamRecord(record);
        
        if (!processCheck.shouldProcess) {
            console.log(`[FINANCIALS] Skipping record: ${processCheck.reason}`);
            results.skipped++;
            continue;
        }
        
        try {
            const gameImage = record.dynamodb?.NewImage;
            if (!gameImage) {
                results.skipped++;
                continue;
            }
            
            const game = unmarshall(gameImage);
            
            if (!shouldProcessGame(game, eventName)) {
                console.log(`[FINANCIALS] Skipping game ${game.id} (status: ${game.gameStatus})`);
                results.skipped++;
                continue;
            }
            
            if (determineIsSeries(game)) {
                results.seriesGames++;
            }
            if (game.recurringGameId) {
                results.recurringGames++;
            }
            if (game.guaranteeOverlayCost && game.guaranteeOverlayCost > 0) {
                results.gamesWithOverlay++;
            }
            
            const result = await processGameFinancials(game, { saveToDatabase: true });
            
            results.processed++;
            results.details.push({
                gameId: game.id,
                eventName,
                isSeries: result.summary?.isSeries,
                isSeriesParent: result.summary?.isSeriesParent,
                hasOverlay: (result.summary?.totalGuaranteeOverlayCost || 0) > 0,
                totalGuaranteeOverlayCost: result.summary?.totalGuaranteeOverlayCost,
                cost: result.costSaveResult,
                snapshot: result.snapshotSaveResult,
                gameFkUpdate: result.gameFkUpdateResult
            });
            
        } catch (error) {
            console.error('[FINANCIALS] Error processing record:', error);
            results.errors++;
            results.details.push({ error: error.message, record: record.eventID });
        }
    }
    
    console.log(`[FINANCIALS] Stream complete: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors, ${results.gamesWithOverlay} with overlay`);
    return results;
};

// ===================================================================
// BATCH PROCESSING
// ===================================================================

exports.batchProcess = async (event) => {
    const gameIds = event.gameIds || [];
    const options = event.options || { saveToDatabase: false };
    
    if (gameIds.length === 0) {
        return { error: 'No gameIds provided' };
    }
    
    const gameTable = getTableName('Game');
    const results = [];
    
    for (const gameId of gameIds) {
        try {
            const result = await ddbDocClient.send(new GetCommand({
                TableName: gameTable,
                Key: { id: gameId }
            }));
            
            if (!result.Item) {
                results.push({ gameId, error: 'Game not found' });
                continue;
            }
            
            if (result.Item.gameStatus === 'NOT_PUBLISHED') {
                results.push({ gameId, skipped: true, error: 'Game is NOT_PUBLISHED' });
                continue;
            }
            
            const processResult = await processGameFinancials(result.Item, options);
            results.push({ gameId, ...processResult });
            
        } catch (error) {
            results.push({ gameId, error: error.message });
        }
    }
    
    return {
        totalRequested: gameIds.length,
        processed: results.filter(r => r.success).length,
        seriesGames: results.filter(r => r.summary?.isSeries).length,
        recurringGames: results.filter(r => r.summary?.recurringGameId).length,
        gamesWithOverlay: results.filter(r => (r.summary?.totalGuaranteeOverlayCost || 0) > 0).length,
        failed: results.filter(r => !r.success).length,
        results
    };
};