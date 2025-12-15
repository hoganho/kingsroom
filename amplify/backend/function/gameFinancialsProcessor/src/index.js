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
Amplify Params - DO NOT EDIT *//**
 * ===================================================================
 * GAME FINANCIALS PROCESSOR LAMBDA
 * ===================================================================
 * 
 * VERSION: 1.2.0
 * 
 * CHANGELOG:
 * - v1.2.0: Added isSeries and isSeriesParent flags for filtering/aggregation
 * 
 * TRIGGERS:
 * - DynamoDB Streams on Game table (INSERT, MODIFY events) → auto-saves
 * - GraphQL mutation (preview or save mode)
 * - Direct Lambda invocation (preview or save mode)
 * 
 * MODES:
 * - Preview (saveToDatabase: false): Calculate and return financial data
 * - Save (saveToDatabase: true): Calculate and persist to DB
 * 
 * RESPONSIBILITIES:
 * - Calculates GameCost (operational costs)
 * - Calculates GameFinancialSnapshot (reporting metrics)
 * - Supports preview for FE confirmation workflows
 * 
 * SERIES HANDLING:
 * - isSeries: true if game is part of a tournament series
 * - isSeriesParent: true if series game AND no parentGameId (consolidated record)
 * - These flags enable proper filtering in aggregate queries
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Frontend / gameDataEnricher                                    │
 * │       │                                                          │
 * │       ▼ (GraphQL: calculateGameFinancials)                      │
 * │  gameFinancialsProcessor                                        │
 * │       │                                                          │
 * │       ├──▶ Preview Mode: Return calculated data                 │
 * │       │                                                          │
 * │       └──▶ Save Mode: Write to GameCost + GameFinancialSnapshot │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Game Table (DynamoDB Stream)                                   │
 * │       │                                                          │
 * │       ▼ (INSERT/MODIFY event)                                   │
 * │  gameFinancialsProcessor → Always saves                         │
 * └─────────────────────────────────────────────────────────────────┘
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
 * @param {Object} game - Game data
 * @returns {boolean}
 */
const determineIsSeries = (game) => {
    return !!(game.isSeries === true || game.tournamentSeriesId);
};

/**
 * Determine if a game is a series parent (consolidated record)
 * A series parent is a game that:
 * - IS part of a series
 * - Does NOT have a parentGameId (it's not a flight/child)
 * 
 * This identifies the "top-level" record for multi-day events
 * @param {Object} game - Game data
 * @returns {boolean}
 */
const determineIsSeriesParent = (game) => {
    const isSeries = determineIsSeries(game);
    // If it's a series game and has no parent, it's the parent/consolidated record
    // Also check finalDay as an additional indicator
    return isSeries && !game.parentGameId;
};

// ===================================================================
// COST CALCULATION
// ===================================================================

/**
 * Calculate GameCost data
 * 
 * @param {Object} game - Game data
 * @param {Object} existingCost - Existing GameCost record (if any)
 * @returns {Object} Calculated cost data
 */
const calculateGameCost = (game, existingCost = null) => {
    const totalEntries = game.totalEntries || 0;
    const dealerRatePerEntry = 15; // $15 per entry
    const computedDealerCost = totalEntries * dealerRatePerEntry;
    
    // Preserve existing manual cost entries, only update computed ones
    const totalTournamentDirectorCost = existingCost?.totalTournamentDirectorCost || 0;
    const totalFloorStaffCost = existingCost?.totalFloorStaffCost || 0;
    const totalSecurityCost = existingCost?.totalSecurityCost || 0;
    const totalPrizeContribution = existingCost?.totalPrizeContribution || 0;
    const totalJackpotContribution = existingCost?.totalJackpotContribution || 0;
    const totalPromotionCost = existingCost?.totalPromotionCost || 0;
    const totalOtherCost = existingCost?.totalOtherCost || 0;
    
    const totalCost = computedDealerCost +
        totalTournamentDirectorCost +
        totalFloorStaffCost +
        totalSecurityCost +
        totalPrizeContribution +
        totalJackpotContribution +
        totalPromotionCost +
        totalOtherCost;
    
    return {
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId,
        gameDate: game.gameStartDateTime,
        // Cost breakdown
        totalDealerCost: computedDealerCost,
        totalTournamentDirectorCost,
        totalFloorStaffCost,
        totalSecurityCost,
        totalPrizeContribution,
        totalJackpotContribution,
        totalPromotionCost,
        totalOtherCost,
        totalCost,
        // Metadata
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
 * @param {Object} game - Game data
 * @param {Object} costData - Calculated cost data
 * @returns {Object} Calculated snapshot data
 */
const calculateGameFinancialSnapshot = (game, costData) => {
    // Revenue metrics
    const rakeRevenue = game.rakeRevenue || 0;
    const venueFee = game.venueFee || 0;
    const totalBuyInsCollected = game.totalBuyInsCollected || 0;
    const totalRevenue = rakeRevenue + venueFee;
    
    // Prizepool metrics
    const prizepoolPlayerContributions = game.prizepoolPlayerContributions || 0;
    const prizepoolAddedValue = game.prizepoolAddedValue || 0;
    const prizepoolTotal = game.prizepoolPaid || game.prizepoolCalculated || (prizepoolPlayerContributions + prizepoolAddedValue);
    const prizepoolSurplus = game.prizepoolSurplus || null;
    
    // Guarantee metrics
    const guaranteeAmount = game.guaranteeAmount || 0;
    const guaranteeOverlayCost = game.guaranteeOverlayCost || 0;
    const guaranteeMet = guaranteeOverlayCost === 0;
    const guaranteeCoverageRate = guaranteeAmount > 0 
        ? Math.round((prizepoolPlayerContributions / guaranteeAmount) * 100) / 100 
        : null;
    
    // Cost metrics
    const totalCost = costData?.totalCost || 0;
    const totalDealerCost = costData?.totalDealerCost || 0;
    const totalStaffCost = (costData?.totalDealerCost || 0) + 
                           (costData?.totalTournamentDirectorCost || 0) + 
                           (costData?.totalFloorStaffCost || 0);
    
    // Profit calculations
    const gameProfit = game.gameProfit || (rakeRevenue - guaranteeOverlayCost);
    const netProfit = totalRevenue - totalCost - guaranteeOverlayCost;
    const profitMargin = totalRevenue > 0 
        ? Math.round((netProfit / totalRevenue) * 100) / 100 
        : null;
    
    // Player/Entry metrics
    const totalUniquePlayers = game.totalUniquePlayers || 0;
    const totalEntries = game.totalEntries || 0;
    
    // Per-player metrics
    const revenuePerPlayer = totalUniquePlayers > 0 
        ? Math.round((totalRevenue / totalUniquePlayers) * 100) / 100 
        : null;
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
    
    // Duration
    let gameDurationMinutes = null;
    if (game.gameStartDateTime && game.gameEndDateTime) {
        const start = new Date(game.gameStartDateTime);
        const end = new Date(game.gameEndDateTime);
        if (!isNaN(start) && !isNaN(end)) {
            gameDurationMinutes = Math.round((end - start) / (1000 * 60));
        }
    }
    
    // Dealer cost per hour (if we have duration)
    const dealerCostPerHour = gameDurationMinutes && gameDurationMinutes > 0 
        ? Math.round((totalDealerCost / (gameDurationMinutes / 60)) * 100) / 100 
        : null;
    
    // ===================================================================
    // SERIES FLAGS - For filtering and aggregation
    // ===================================================================
    const isSeries = determineIsSeries(game);
    const isSeriesParent = determineIsSeriesParent(game);
    
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
        prizepoolAddedValue,
        prizepoolTotal,
        prizepoolSurplus,
        
        // Guarantee
        guaranteeOverlayCost,
        guaranteeCoverageRate,
        guaranteeMet,
        
        // Costs
        totalCost,
        totalDealerCost,
        totalStaffCost,
        totalTournamentDirectorCost: costData?.totalTournamentDirectorCost || 0,
        totalFloorStaffCost: costData?.totalFloorStaffCost || 0,
        totalPromotionCost: costData?.totalPromotionCost || 0,
        totalOtherCost: costData?.totalOtherCost || 0,
        
        // Profit
        gameProfit,
        netProfit,
        profitMargin,
        
        // Per-player metrics
        revenuePerPlayer,
        costPerPlayer,
        profitPerPlayer,
        rakePerEntry,
        staffCostPerPlayer,
        dealerCostPerHour,
        
        // ===================================================================
        // SERIES FLAGS - NEW in v1.2.0
        // ===================================================================
        // isSeries: true if game is part of a tournament series
        // Use to exclude series games from regular game aggregations
        isSeries,
        
        // isSeriesParent: true if this is the consolidated/parent record
        // Use to include only parent records when aggregating series data
        // (avoids double-counting flights/days)
        isSeriesParent,
        
        // Also store parentGameId for reference
        parentGameId: game.parentGameId || null,
        
        // ===================================================================
        // COMPOSITE QUERY KEYS - For efficient GSI queries
        // ===================================================================
        // Format: "{entityId}#REGULAR" or "{entityId}#SERIES"
        entitySeriesKey: game.entityId ? `${game.entityId}#${isSeries ? 'SERIES' : 'REGULAR'}` : null,
        
        // Format: "{venueId}#REGULAR" or "{venueId}#SERIES"
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
 * Save GameCost to database
 */
const saveGameCost = async (costData, existingCost = null) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        if (existingCost) {
            // Update existing
            await ddbDocClient.send(new UpdateCommand({
                TableName: getTableName('GameCost'),
                Key: { id: existingCost.id },
                UpdateExpression: `SET 
                    totalDealerCost = :dc, 
                    totalCost = :tc, 
                    updatedAt = :now, 
                    #lastChanged = :ts, 
                    #ver = :ver`,
                ExpressionAttributeNames: { 
                    '#lastChanged': '_lastChangedAt',
                    '#ver': '_version'
                },
                ExpressionAttributeValues: { 
                    ':dc': costData.totalDealerCost, 
                    ':tc': costData.totalCost, 
                    ':now': now, 
                    ':ts': timestamp,
                    ':ver': (existingCost._version || 1) + 1
                }
            }));
            
            console.log(`[FINANCIALS] ✅ Updated GameCost ${existingCost.id}`);
            return { action: 'UPDATED', costId: existingCost.id };
        }
        
        // Create new
        const costId = uuidv4();
        await ddbDocClient.send(new PutCommand({
            TableName: getTableName('GameCost'),
            Item: {
                id: costId,
                ...costData,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: timestamp,
                __typename: 'GameCost'
            }
        }));
        
        console.log(`[FINANCIALS] ✅ Created GameCost ${costId}`);
        return { action: 'CREATED', costId };
        
    } catch (error) {
        console.error(`[FINANCIALS] ❌ Error saving GameCost:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

/**
 * Save GameFinancialSnapshot to database
 */
const saveGameFinancialSnapshot = async (snapshotData, costSaveResult) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const snapshotTable = getTableName('GameFinancialSnapshot');
    
    try {
        // Check for existing snapshot
        const existingResult = await ddbDocClient.send(new QueryCommand({
            TableName: snapshotTable,
            IndexName: 'byGameFinancialSnapshot',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': snapshotData.gameId }
        }));
        
        const snapshotFields = {
            ...snapshotData,
            gameCostId: costSaveResult?.costId || null,
            snapshotType: 'AUTO',
            isReconciled: false,
            updatedAt: now,
            _lastChangedAt: timestamp
        };
        
        // Remove gameId from fields (it's stored separately)
        const gameId = snapshotFields.gameId;
        delete snapshotFields.gameId;

        if (existingResult.Items?.[0]) {
            // Update existing
            const existing = existingResult.Items[0];
            
            const updateKeys = Object.keys(snapshotFields);
            const updateExpression = 'SET ' + updateKeys.map(key => `#${key} = :${key}`).join(', ') + ', #ver = :ver';
            const expressionAttributeNames = {
                ...Object.fromEntries(updateKeys.map(k => [`#${k}`, k])),
                '#ver': '_version'
            };
            const expressionAttributeValues = {
                ...Object.fromEntries(updateKeys.map(k => [`:${k}`, snapshotFields[k]])),
                ':ver': (existing._version || 1) + 1
            };

            await ddbDocClient.send(new UpdateCommand({
                TableName: snapshotTable,
                Key: { id: existing.id },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
            
            console.log(`[FINANCIALS] ✅ Updated GameFinancialSnapshot ${existing.id} (isSeries: ${snapshotData.isSeries}, isSeriesParent: ${snapshotData.isSeriesParent})`);
            return { action: 'UPDATED', snapshotId: existing.id };
        }

        // Create new snapshot
        const snapshotId = uuidv4();
        await ddbDocClient.send(new PutCommand({
            TableName: snapshotTable,
            Item: {
                id: snapshotId,
                gameId: gameId,
                ...snapshotFields,
                createdAt: now,
                _version: 1,
                __typename: 'GameFinancialSnapshot'
            }
        }));
        
        console.log(`[FINANCIALS] ✅ Created GameFinancialSnapshot ${snapshotId} (isSeries: ${snapshotData.isSeries}, isSeriesParent: ${snapshotData.isSeriesParent})`);
        return { action: 'CREATED', snapshotId };
        
    } catch (error) {
        console.error(`[FINANCIALS] ❌ Error saving GameFinancialSnapshot:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

// ===================================================================
// CORE PROCESSING FUNCTION
// ===================================================================

/**
 * Process game financials - calculate and optionally save
 * 
 * @param {Object} game - Game data
 * @param {Object} options - Processing options
 * @param {boolean} options.saveToDatabase - If true, persist to DB; if false, preview only
 * @returns {Object} Processing result with calculated data
 */
const processGameFinancials = async (game, options = {}) => {
    const { saveToDatabase = false } = options;
    const startTime = Date.now();
    
    // Log series status for debugging
    const isSeries = determineIsSeries(game);
    const isSeriesParent = determineIsSeriesParent(game);
    console.log(`[FINANCIALS] Processing game ${game.id} (saveToDatabase: ${saveToDatabase}, isSeries: ${isSeries}, isSeriesParent: ${isSeriesParent})`);
    
    // Get existing cost record (for preserving manual entries)
    const existingCost = saveToDatabase ? await getExistingGameCost(game.id) : null;
    
    // Calculate cost data
    const costData = calculateGameCost(game, existingCost);
    
    // Calculate snapshot data
    const snapshotData = calculateGameFinancialSnapshot(game, costData);
    
    // Build result
    const result = {
        success: true,
        gameId: game.id,
        mode: saveToDatabase ? 'SAVE' : 'PREVIEW',
        
        // Calculated data (always returned for FE)
        calculatedCost: costData,
        calculatedSnapshot: snapshotData,
        
        // Summary metrics for FE display
        summary: {
            // Revenue
            totalRevenue: snapshotData.totalRevenue,
            rakeRevenue: snapshotData.rakeRevenue,
            totalBuyInsCollected: snapshotData.totalBuyInsCollected,
            
            // Costs
            totalCost: snapshotData.totalCost,
            totalDealerCost: snapshotData.totalDealerCost,
            
            // Prizepool
            prizepoolTotal: snapshotData.prizepoolTotal,
            prizepoolPlayerContributions: snapshotData.prizepoolPlayerContributions,
            prizepoolAddedValue: snapshotData.prizepoolAddedValue,
            
            // Guarantee
            guaranteeMet: snapshotData.guaranteeMet,
            guaranteeOverlayCost: snapshotData.guaranteeOverlayCost,
            guaranteeCoverageRate: snapshotData.guaranteeCoverageRate,
            
            // Profit
            gameProfit: snapshotData.gameProfit,
            netProfit: snapshotData.netProfit,
            profitMargin: snapshotData.profitMargin,
            
            // Per-player
            revenuePerPlayer: snapshotData.revenuePerPlayer,
            costPerPlayer: snapshotData.costPerPlayer,
            profitPerPlayer: snapshotData.profitPerPlayer,
            rakePerEntry: snapshotData.rakePerEntry,
            
            // Series flags (for FE awareness)
            isSeries: snapshotData.isSeries,
            isSeriesParent: snapshotData.isSeriesParent
        },
        
        // Save results (only populated when saveToDatabase is true)
        costSaveResult: null,
        snapshotSaveResult: null,
        
        processingTimeMs: 0
    };
    
    // Save to database if requested
    if (saveToDatabase) {
        result.costSaveResult = await saveGameCost(costData, existingCost);
        result.snapshotSaveResult = await saveGameFinancialSnapshot(snapshotData, result.costSaveResult);
    }
    
    result.processingTimeMs = Date.now() - startTime;
    
    return result;
};

// ===================================================================
// MAIN HANDLER - GRAPHQL / DIRECT INVOCATION
// ===================================================================

/**
 * Main handler for GraphQL mutations and direct invocations
 * 
 * Input formats:
 * 1. GraphQL: { arguments: { input: { game: {...}, options: {...} } } }
 * 2. Direct with game object: { game: {...}, options: { saveToDatabase: true/false } }
 * 3. Direct with gameId: { gameId: "xxx", options: { saveToDatabase: true/false } }
 * 4. DynamoDB Stream: { Records: [...] }
 */
exports.handler = async (event) => {
    // Check if this is a DynamoDB Stream event
    if (event.Records && Array.isArray(event.Records)) {
        return await handleStreamEvent(event);
    }
    
    // GraphQL or direct invocation
    const input = event.arguments?.input || event.input || event;
    const options = input.options || {};
    
    // Default to preview mode for explicit calls (safety)
    const saveToDatabase = options.saveToDatabase === true;
    
    try {
        let game = input.game;
        
        // If gameId provided instead of full game, fetch it
        if (!game && input.gameId) {
            const gameTable = getTableName('Game');
            const result = await ddbDocClient.send(new GetCommand({
                TableName: gameTable,
                Key: { id: input.gameId }
            }));
            
            if (!result.Item) {
                return {
                    success: false,
                    error: `Game not found: ${input.gameId}`
                };
            }
            
            game = result.Item;
        }
        
        if (!game || !game.id) {
            return {
                success: false,
                error: 'Game data or gameId is required'
            };
        }
        
        // Skip NOT_PUBLISHED games
        if (game.gameStatus === 'NOT_PUBLISHED') {
            console.log(`[FINANCIALS] Skipping NOT_PUBLISHED game: ${game.id}`);
            return {
                success: false,
                skipped: true,
                error: 'Game is NOT_PUBLISHED - financial processing skipped'
            };
        }
        
        // Process financials
        return await processGameFinancials(game, { saveToDatabase });
        
    } catch (error) {
        console.error('[FINANCIALS] Handler error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// ===================================================================
// STREAM HANDLER - DYNAMODB STREAMS
// ===================================================================

/**
 * Handle DynamoDB Stream events (always saves)
 */
const handleStreamEvent = async (event) => {
    console.log(`[FINANCIALS] Processing ${event.Records?.length || 0} stream records`);
    
    const results = {
        processed: 0,
        skipped: 0,
        errors: 0,
        seriesGames: 0,
        details: []
    };
    
    for (const record of event.Records || []) {
        const eventName = record.eventName;
        
        // Skip REMOVE events
        if (eventName === 'REMOVE') {
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
            
            // Track series games for logging
            if (determineIsSeries(game)) {
                results.seriesGames++;
            }
            
            // Stream events always save to database
            const result = await processGameFinancials(game, { saveToDatabase: true });
            
            results.processed++;
            results.details.push({
                gameId: game.id,
                eventName,
                isSeries: result.summary?.isSeries,
                isSeriesParent: result.summary?.isSeriesParent,
                cost: result.costSaveResult,
                snapshot: result.snapshotSaveResult
            });
            
        } catch (error) {
            console.error('[FINANCIALS] Error processing record:', error);
            results.errors++;
            results.details.push({
                error: error.message,
                record: record.eventID
            });
        }
    }
    
    console.log(`[FINANCIALS] Stream complete: ${results.processed} processed (${results.seriesGames} series), ${results.skipped} skipped, ${results.errors} errors`);
    
    return results;
};

// ===================================================================
// BATCH PROCESSING - REPROCESSING SUPPORT
// ===================================================================

/**
 * Process multiple games by ID (for batch reprocessing)
 * 
 * Usage: { gameIds: ["xxx", "yyy"], options: { saveToDatabase: true } }
 */
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
            
            // Skip NOT_PUBLISHED games
            if (result.Item.gameStatus === 'NOT_PUBLISHED') {
                results.push({ gameId, skipped: true, error: 'Game is NOT_PUBLISHED' });
                continue;
            }
            
            const processResult = await processGameFinancials(result.Item, options);
            results.push({
                gameId,
                isSeries: processResult.summary?.isSeries,
                isSeriesParent: processResult.summary?.isSeriesParent,
                ...processResult
            });
            
        } catch (error) {
            results.push({ gameId, error: error.message });
        }
    }
    
    return {
        totalRequested: gameIds.length,
        processed: results.filter(r => r.success).length,
        seriesGames: results.filter(r => r.isSeries).length,
        failed: results.filter(r => !r.success).length,
        results
    };
};