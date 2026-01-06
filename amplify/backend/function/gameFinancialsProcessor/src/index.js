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
 * VERSION: 1.5.0
 * 
 * CHANGELOG:
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
 */
const calculateGameCost = (game, existingCost = null) => {
    const totalEntries = game.totalEntries || 0;
    const dealerRatePerEntry = 15;
    const computedDealerCost = totalEntries * dealerRatePerEntry;
    
    // Preserve existing manual cost entries
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
        totalDealerCost: computedDealerCost,
        totalTournamentDirectorCost,
        totalFloorStaffCost,
        totalSecurityCost,
        totalPrizeContribution,
        totalJackpotContribution,
        totalPromotionCost,
        totalOtherCost,
        totalCost,
        dealerRatePerEntry,
        entriesUsedForCalculation: totalEntries
    };
};

// ===================================================================
// FINANCIAL SNAPSHOT CALCULATION
// ===================================================================

/**
 * Calculate GameFinancialSnapshot data
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
    
    const dealerCostPerHour = gameDurationMinutes && gameDurationMinutes > 0 
        ? Math.round((totalDealerCost / (gameDurationMinutes / 60)) * 100) / 100 
        : null;
    
    // Prizepool adjustments
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
    
    // Series flags
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
        prizepoolPaidDelta,
        prizepoolJackpotContributions,
        prizepoolAccumulatorTicketPayoutEstimate,
        prizepoolAccumulatorTicketPayoutActual: game.prizepoolAccumulatorTicketPayoutActual || null,
        
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
 * Save GameCost to database
 */
const saveGameCost = async (costData, existingCost = null) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        if (existingCost) {
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
            
            console.log(`[FINANCIALS] Updated GameCost ${existingCost.id}`);
            return { action: 'UPDATED', costId: existingCost.id };
        }
        
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
        
        console.log(`[FINANCIALS] Created GameCost ${costId}`);
        return { action: 'CREATED', costId };
        
    } catch (error) {
        console.error(`[FINANCIALS] Error saving GameCost:`, error);
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
        
        const gameId = snapshotFields.gameId;
        delete snapshotFields.gameId;
        
        // Remove null GSI key fields
        if (!snapshotFields.tournamentSeriesId) delete snapshotFields.tournamentSeriesId;
        if (!snapshotFields.recurringGameId) delete snapshotFields.recurringGameId;

        if (existingResult.Items?.[0]) {
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
            
            console.log(`[FINANCIALS] Updated GameFinancialSnapshot ${existing.id}`);
            return { action: 'UPDATED', snapshotId: existing.id };
        }

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
        
        console.log(`[FINANCIALS] Created GameFinancialSnapshot ${snapshotId}`);
        return { action: 'CREATED', snapshotId };
        
    } catch (error) {
        console.error(`[FINANCIALS] Error saving GameFinancialSnapshot:`, error);
        return { action: 'ERROR', error: error.message };
    }
};

/**
 * Update Game record with gameCostId and gameFinancialSnapshotId
 */
const updateGameFinancialForeignKeys = async (gameId, costSaveResult, snapshotSaveResult) => {
    const updates = {};
    
    if (costSaveResult?.action === 'CREATED' && costSaveResult?.costId) {
        updates.gameCostId = costSaveResult.costId;
    }
    
    if (snapshotSaveResult?.action === 'CREATED' && snapshotSaveResult?.snapshotId) {
        updates.gameFinancialSnapshotId = snapshotSaveResult.snapshotId;
    }
    
    if (Object.keys(updates).length === 0) {
        return { updated: false };
    }
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        const updateExpression = 'SET ' + 
            Object.keys(updates).map(key => `#${key} = :${key}`).join(', ') + 
            ', updatedAt = :now, #lastChanged = :ts';
        
        const expressionAttributeNames = {
            ...Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k])),
            '#lastChanged': '_lastChangedAt'
        };
        
        const expressionAttributeValues = {
            ...Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]])),
            ':now': now,
            ':ts': timestamp
        };
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: getTableName('Game'),
            Key: { id: gameId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(id)'
        }));
        
        console.log(`[FINANCIALS] Updated Game ${gameId} with FK:`, updates);
        return { updated: true, fields: Object.keys(updates) };
        
    } catch (error) {
        console.error(`[FINANCIALS] Failed to update Game FKs for ${gameId}:`, error.message);
        return { updated: false, error: error.message };
    }
};

// ===================================================================
// CORE PROCESSING FUNCTION
// ===================================================================

/**
 * Process game financials - calculate and optionally save
 */
const processGameFinancials = async (game, options = {}) => {
    const { saveToDatabase = false } = options;
    const startTime = Date.now();
    
    const isSeries = determineIsSeries(game);
    const isSeriesParent = determineIsSeriesParent(game);
    console.log(`[FINANCIALS] Processing game ${game.id} (save: ${saveToDatabase}, isSeries: ${isSeries})`);
    
    const existingCost = saveToDatabase ? await getExistingGameCost(game.id) : null;
    const costData = calculateGameCost(game, existingCost);
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
    console.log('[FINANCIALS] v1.5.0 - With content hash check');
    
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
            
            const result = await processGameFinancials(game, { saveToDatabase: true });
            
            results.processed++;
            results.details.push({
                gameId: game.id,
                eventName,
                isSeries: result.summary?.isSeries,
                isSeriesParent: result.summary?.isSeriesParent,
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
    
    console.log(`[FINANCIALS] Stream complete: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors`);
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
        failed: results.filter(r => !r.success).length,
        results
    };
};