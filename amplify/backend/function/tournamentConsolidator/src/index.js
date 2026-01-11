/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_PLAYERENTRYTABLE_ARN
    API_KINGSROOM_PLAYERENTRYTABLE_NAME
    API_KINGSROOM_PLAYERRESULTTABLE_ARN
    API_KINGSROOM_PLAYERRESULTTABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * TOURNAMENT CONSOLIDATOR LAMBDA - REFACTORED
 * VERSION: 2.0.0
 * 
 * CHANGES v2.0.0:
 * - PARENT records now store ALL aggregated/derived fields:
 *   - gameYearMonth (derived from earliest child start)
 *   - buyInTier (calculated from buyIn)
 *   - gameDayOfWeek (derived from earliest child start)
 *   - totalBuyInsCollected (SUM from children)
 *   - prizepoolPlayerContributions (SUM from children)
 *   - prizepoolAddedValue (from final day child)
 *   - prizepoolSurplus (from final day child)
 *   - guaranteeOverlayCost (from final day child)
 *   - gameProfit (SUM from children)
 *   - gameActualStartDateTime (earliest from children)
 *   - gameEndDateTime (latest from children)
 *   - totalDuration (calculated)
 *   - gameTags (merged unique from children)
 * 
 * CHANGES v1.5.0:
 * - Added content hash check to skip non-meaningful changes
 * - Removed lambda-monitoring (deprecated)
 * - Only processes records where dataChangedAt changed
 * 
 * CHANGES v1.4.0:
 * - Fixed totalRebuys calculation for parent records
 * 
 * This Lambda handles TWO types of invocations:
 * 
 * 1. DynamoDB Stream Trigger (Original)
 *    - Triggered when Game table changes
 *    - Performs actual consolidation (creates parents, links children)
 *    - NOW: Only processes meaningful changes (dataChangedAt changed)
 * 
 * 2. GraphQL Query: previewConsolidation
 *    - Called from frontend to preview what will happen
 *    - Returns analysis without modifying any data
 * 
 * PLAYER DATA IMPACT:
 * This Lambda modifies player data directly (no SQS):
 * - PlayerEntry: Updates entryType classification
 * - PlayerResult: Creates consolidated results on parent
 * - PlayerSummary: Applies stat adjustments (prevents double-counting)
 * - PlayerVenue: Applies venue-level stat adjustments
 * 
 * The content hash check prevents unnecessary reprocessing that could
 * corrupt player stats with duplicate adjustments.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Import the extracted consolidation logic
const {
    checkIsMultiDay,
    generateConsolidationKey,
    deriveParentName,
    previewConsolidation,
    calculateAggregatedTotals,
    buildParentRecord
} = require('./consolidation-logic');

const { 
    consolidatePlayerDataForTournament 
} = require('./player-consolidation-logic');

// --- CONFIGURATION ---
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Environment Variables
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const PLAYER_ENTRY_TABLE = process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME;
const PLAYER_RESULT_TABLE = process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME;

// Helper to derive table names from existing ones
const getTableName = (modelName) => {
    const parts = GAME_TABLE.split('-');
    const env = parts.pop();
    const apiId = parts.pop();
    return `${modelName}-${apiId}-${env}`;
};

// ===================================================================
// CONTENT HASH CHECK - Skip non-meaningful changes
// ===================================================================

/**
 * Check if this stream record represents a meaningful change
 * that requires consolidation processing.
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
    
    // Skip REMOVE events
    if (eventName === 'REMOVE') {
        return { shouldProcess: false, reason: 'Remove event' };
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
// GRAPHQL QUERY HANDLER - previewConsolidation
// ===================================================================

/**
 * Handles the previewConsolidation GraphQL query
 * Returns analysis without modifying any data
 */
const handlePreviewConsolidation = async (input) => {
    const { gameData, existingGameId, includeSiblingDetails } = input;
    
    console.log('[Consolidator:Preview] Analyzing:', {
        name: gameData.name,
        venueId: gameData.venueId,
        buyIn: gameData.buyIn,
        tournamentSeriesId: gameData.tournamentSeriesId,
        eventNumber: gameData.eventNumber,
        seriesName: gameData.seriesName || '❌ MISSING',
        isMainEvent: gameData.isMainEvent || false,
        entityId: gameData.entityId || '❌ MISSING',
        dayNumber: gameData.dayNumber,
        flightLetter: gameData.flightLetter
    });
    
    if (gameData.isSeries && !gameData.seriesName) {
        console.warn('[Consolidator:Preview] ⚠️ isSeries=true but seriesName is missing!');
    }
    
    const preview = previewConsolidation(gameData);
    
    console.log('[Consolidator:Preview] Strategy selected:', {
        willConsolidate: preview.willConsolidate,
        strategy: preview.keyStrategy,
        confidence: preview.keyConfidence,
        consolidationKey: preview.consolidationKey,
        derivedParentName: preview.derivedParentName
    });
    
    const response = {
        willConsolidate: preview.willConsolidate,
        reason: preview.reason,
        warnings: preview.warnings,
        detectedPattern: {
            isMultiDay: preview.detectedPattern.isMultiDay,
            detectionSource: preview.detectedPattern.detectionSource,
            parsedDayNumber: preview.detectedPattern.parsedDayNumber,
            parsedFlightLetter: preview.detectedPattern.parsedFlightLetter,
            isFinalDay: preview.detectedPattern.isFinalDay,
            derivedParentName: preview.derivedParentName
        },
        consolidation: null
    };
    
    if (preview.willConsolidate && preview.consolidationKey) {
        const consolidationDetails = await fetchConsolidationDetails(
            preview.consolidationKey,
            preview.derivedParentName,
            gameData,
            includeSiblingDetails
        );
        response.consolidation = consolidationDetails;
    }
    
    return response;
};

/**
 * Fetches existing consolidation state from database
 */
const fetchConsolidationDetails = async (
    consolidationKey,
    derivedParentName,
    newGameData,
    includeSiblingDetails
) => {
    console.log('[Consolidator:Preview] Numeric fields for projection:', {
        totalUniquePlayers: newGameData.totalUniquePlayers,
        totalInitialEntries: newGameData.totalInitialEntries,
        totalEntries: newGameData.totalEntries,
        prizepoolPaid: newGameData.prizepoolPaid,
        gameStatus: newGameData.gameStatus
    });

    const parentQuery = await ddbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byConsolidationKey',
        KeyConditionExpression: 'consolidationKey = :key',
        FilterExpression: 'consolidationType = :ptype',
        ExpressionAttributeValues: {
            ':key': consolidationKey,
            ':ptype': 'PARENT'
        }
    }));
    
    const existingParent = parentQuery.Items?.[0];
    
    let siblings = [];
    let siblingCount = 0;
    
    if (existingParent) {
        const siblingsQuery = await ddbDocClient.send(new QueryCommand({
            TableName: GAME_TABLE,
            IndexName: 'byParentGame',
            KeyConditionExpression: 'parentGameId = :pid',
            ExpressionAttributeValues: {
                ':pid': existingParent.id
            }
        }));
        
        siblings = siblingsQuery.Items || [];
        siblingCount = siblings.length;
    }
    
    const normalizedNewGame = {
        ...newGameData,
        totalUniquePlayers: newGameData.totalUniquePlayers || 0,
        totalInitialEntries: newGameData.totalInitialEntries || 0,
        totalEntries: newGameData.totalEntries || 0,
        totalRebuys: newGameData.totalRebuys || 0,
        totalAddons: newGameData.totalAddons || 0,
        prizepoolPaid: newGameData.prizepoolPaid || 0,
        prizepoolCalculated: newGameData.prizepoolCalculated || 0
    };
    
    const allChildren = [...siblings, normalizedNewGame];
    const projectedTotals = calculateAggregatedTotals(allChildren);
    
    console.log('[Consolidator:Preview] Projected totals:', {
        siblingCount,
        totalChildrenForProjection: allChildren.length,
        projectedUniquePlayers: projectedTotals.totalUniquePlayers,
        projectedEntries: projectedTotals.totalEntries,
        // *** NEW v2.0.0: Log additional projected fields ***
        gameYearMonth: projectedTotals.gameYearMonth,
        buyInTier: projectedTotals.buyInTier,
        gameDayOfWeek: projectedTotals.gameDayOfWeek,
        totalBuyInsCollected: projectedTotals.totalBuyInsCollected
    });
    
    return {
        consolidationKey,
        keyStrategy: consolidationKey.startsWith('SERIES_') ? 'SERIES_EVENT' : 'VENUE_BUYIN_NAME',
        parentExists: !!existingParent,
        parentGameId: existingParent?.id || null,
        parentName: existingParent?.name || derivedParentName,
        siblingCount,
        siblings: includeSiblingDetails ? siblings.map(s => ({
            id: s.id,
            name: s.name,
            dayNumber: s.dayNumber,
            flightLetter: s.flightLetter,
            gameStatus: s.gameStatus,
            gameStartDateTime: s.gameStartDateTime,
            totalUniquePlayers: s.totalUniquePlayers,
            totalInitialEntries: s.totalInitialEntries,
            totalEntries: s.totalEntries,
            finalDay: s.finalDay
        })) : null,
        projectedTotals: {
            totalUniquePlayers: projectedTotals.totalUniquePlayers,
            totalInitialEntries: projectedTotals.totalInitialEntries,
            totalEntries: projectedTotals.totalEntries,
            totalRebuys: projectedTotals.totalRebuys,
            totalAddons: projectedTotals.totalAddons,
            prizepoolPaid: projectedTotals.prizepoolPaid,
            prizepoolCalculated: projectedTotals.prizepoolCalculated,
            earliestStart: projectedTotals.earliestStart,
            latestEnd: projectedTotals.latestEnd,
            projectedStatus: projectedTotals.parentStatus,
            isPartialData: projectedTotals.isPartialData,
            missingFlightCount: projectedTotals.missingFlightCount,
            // *** NEW v2.0.0: Include new projected fields in response ***
            gameYearMonth: projectedTotals.gameYearMonth,
            buyInTier: projectedTotals.buyInTier,
            gameDayOfWeek: projectedTotals.gameDayOfWeek,
            totalBuyInsCollected: projectedTotals.totalBuyInsCollected,
            gameProfit: projectedTotals.gameProfit,
            totalDuration: projectedTotals.totalDuration
        }
    };
};

// ===================================================================
// DYNAMODB STREAM HANDLER - Original Consolidation Logic
// ===================================================================

/**
 * Helper to handle DynamoDB Pagination
 */
const fetchAllItems = async (params) => {
    let items = [];
    let lastEvaluatedKey = undefined;
    
    do {
        const response = await ddbDocClient.send(new QueryCommand({
            ...params,
            ExclusiveStartKey: lastEvaluatedKey
        }));
        
        if (response.Items) items = items.concat(response.Items);
        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return items;
};

/**
 * Syncs results from final day to parent record
 */
const syncParentResults = async (parentId, realResults) => {
    if (!realResults || realResults.length === 0) return;
    
    console.log(`[Consolidator] Syncing ${realResults.length} results to parent ${parentId}`);
    
    // For now, this just logs - actual result syncing would be implemented here
    // The PlayerResult consolidation handles the actual data sync
};

/**
 * Calculates actual unique player count from PlayerEntry table
 */
const calculateActualUniquePlayers = async (parentId) => {
    const childQuery = await ddbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byParentGame',
        KeyConditionExpression: 'parentGameId = :pid',
        ExpressionAttributeValues: { ':pid': parentId }
    }));
    
    const children = childQuery.Items || [];
    if (children.length === 0) return 0;
    
    const allPlayerIds = new Set();
    
    for (const child of children) {
        const entries = await fetchAllItems({
            TableName: PLAYER_ENTRY_TABLE,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gid',
            ExpressionAttributeValues: { ':gid': child.id }
        });
        
        for (const entry of entries) {
            if (entry.playerId) {
                allPlayerIds.add(entry.playerId);
            }
        }
    }
    
    return allPlayerIds.size;
};

/**
 * Recalculates parent totals from all children
 * 
 * *** NEW v2.0.0: Now updates ALL aggregated and derived fields ***
 * Previously only updated: totalUniquePlayers, totalInitialEntries, totalEntries,
 *   totalRebuys, totalAddons, prizepoolPaid, prizepoolCalculated, gameStartDateTime,
 *   gameStatus, rakeRevenue
 * 
 * Now also updates:
 *   - gameYearMonth, gameDayOfWeek, buyInTier (derived)
 *   - totalBuyInsCollected, prizepoolPlayerContributions, gameProfit (aggregated)
 *   - prizepoolAddedValue, prizepoolSurplus, guaranteeOverlayCost (from final day)
 *   - gameActualStartDateTime, gameEndDateTime, totalDuration (date tracking)
 *   - gameTags (merged from children)
 *   - projectedRakeRevenue, rakeSubsidy, fullRakeRealized (rake fields)
 *   - playersRemaining, totalChipsInPlay, averagePlayerStack (live tracking)
 *   - isPartialData, missingFlightCount (status tracking)
 */
const recalculateParentTotals = async (parentId, currentParentRecord) => {
    // Fetch all children
    const childQuery = await ddbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byParentGame',
        KeyConditionExpression: 'parentGameId = :pid',
        ExpressionAttributeValues: { ':pid': parentId }
    }));
    
    const children = childQuery.Items || [];
    
    if (children.length === 0) {
        console.warn(`[Consolidator] No children found for parent ${parentId}`);
        return;
    }
    
    console.log(`[Consolidator] Recalculating parent ${parentId} from ${children.length} children`);
    
    // Use pure function to aggregate
    const aggregated = calculateAggregatedTotals(children);
    
    // Calculate actual unique players from PlayerEntry
    const actualUniquePlayers = await calculateActualUniquePlayers(parentId);
    
    // Determine final totalEntries
    let calculatedTotalEntries = aggregated.totalEntries;
    
    // If we have actual unique players and the naive sum is wrong, calculate from that
    if (actualUniquePlayers > 0) {
        // totalRebuys = totalEntries - totalUniquePlayers
        const impliedTotalEntries = actualUniquePlayers + (aggregated.totalRebuys || 0);
        if (impliedTotalEntries !== calculatedTotalEntries) {
            console.log(`[Consolidator] Adjusting totalEntries: naive=${calculatedTotalEntries}, implied=${impliedTotalEntries}`);
            calculatedTotalEntries = impliedTotalEntries;
        }
    }
    
    // Calculate totalRebuys as difference
    const calculatedTotalRebuys = calculatedTotalEntries - actualUniquePlayers;
    
    // Build update expression
    const now = new Date().toISOString();
    const baseExpression = `SET 
        totalUniquePlayers = :tup,
        totalInitialEntries = :tie,
        totalEntries = :te,
        totalRebuys = :tr,
        totalAddons = :ta,
        prizepoolPaid = :pp,
        prizepoolCalculated = :pc,
        gameStartDateTime = :startDate,
        gameStatus = :status,
        updatedAt = :now,
        #lca = :lastChanged,
        #v = #v + :versionIncrement`;
    
    const dynamicValues = {
        ':tup': actualUniquePlayers,
        ':tie': aggregated.totalInitialEntries,
        ':te': calculatedTotalEntries,
        ':tr': calculatedTotalRebuys,
        ':ta': aggregated.totalAddons,
        ':pp': aggregated.prizepoolPaid,
        ':pc': aggregated.prizepoolCalculated,
        ':startDate': aggregated.earliestStart,
        ':status': aggregated.parentStatus,
        ':now': now,
        ':lastChanged': Date.now(),
        ':versionIncrement': 1
    };
    
    let dynamicExpression = '';
    
    // ═══════════════════════════════════════════════════════════════
    // *** NEW v2.0.0: Add all the previously missing fields ***
    // ═══════════════════════════════════════════════════════════════
    
    // --- Date/Time fields ---
    if (aggregated.latestEnd) {
        dynamicExpression += ', gameEndDateTime = :endDate';
        dynamicValues[':endDate'] = aggregated.latestEnd;
    }
    
    // *** NEW v2.0.0: gameActualStartDateTime (earliest actual start from children) ***
    if (aggregated.gameActualStartDateTime) {
        dynamicExpression += ', gameActualStartDateTime = :actualStart';
        dynamicValues[':actualStart'] = aggregated.gameActualStartDateTime;
    }
    
    // *** NEW v2.0.0: totalDuration (calculated from earliest to latest) ***
    if (aggregated.totalDuration !== null) {
        dynamicExpression += ', totalDuration = :duration';
        dynamicValues[':duration'] = aggregated.totalDuration;
    }
    
    // --- Derived date fields ---
    // *** NEW v2.0.0: gameYearMonth (derived from earliest start) ***
    if (aggregated.gameYearMonth) {
        dynamicExpression += ', gameYearMonth = :ym';
        dynamicValues[':ym'] = aggregated.gameYearMonth;
    }
    
    // *** NEW v2.0.0: gameDayOfWeek (derived from earliest start) ***
    if (aggregated.gameDayOfWeek) {
        dynamicExpression += ', gameDayOfWeek = :dow';
        dynamicValues[':dow'] = aggregated.gameDayOfWeek;
    }
    
    // *** NEW v2.0.0: buyInTier (calculated from buyIn amount) ***
    if (aggregated.buyInTier) {
        dynamicExpression += ', buyInTier = :bit';
        dynamicValues[':bit'] = aggregated.buyInTier;
    }
    
    // --- Financial fields (now aggregated) ---
    // *** NEW v2.0.0: totalBuyInsCollected (SUM from children) ***
    if (aggregated.totalBuyInsCollected !== undefined && aggregated.totalBuyInsCollected !== null) {
        dynamicExpression += ', totalBuyInsCollected = :tbc';
        dynamicValues[':tbc'] = aggregated.totalBuyInsCollected;
    }
    
    // *** NEW v2.0.0: prizepoolPlayerContributions (SUM from children) ***
    if (aggregated.prizepoolPlayerContributions !== undefined && aggregated.prizepoolPlayerContributions !== null) {
        dynamicExpression += ', prizepoolPlayerContributions = :ppc';
        dynamicValues[':ppc'] = aggregated.prizepoolPlayerContributions;
    }
    
    // *** NEW v2.0.0: prizepoolAddedValue (from final day child) ***
    if (aggregated.prizepoolAddedValue !== undefined && aggregated.prizepoolAddedValue !== null) {
        dynamicExpression += ', prizepoolAddedValue = :pav';
        dynamicValues[':pav'] = aggregated.prizepoolAddedValue;
    }
    
    // *** NEW v2.0.0: prizepoolSurplus (from final day child) ***
    if (aggregated.prizepoolSurplus !== undefined && aggregated.prizepoolSurplus !== null) {
        dynamicExpression += ', prizepoolSurplus = :ps';
        dynamicValues[':ps'] = aggregated.prizepoolSurplus;
    }
    
    // *** NEW v2.0.0: guaranteeOverlayCost (from final day child) ***
    if (aggregated.guaranteeOverlayCost !== undefined && aggregated.guaranteeOverlayCost !== null) {
        dynamicExpression += ', guaranteeOverlayCost = :goc';
        dynamicValues[':goc'] = aggregated.guaranteeOverlayCost;
    }
    
    // *** NEW v2.0.0: gameProfit (SUM from children) ***
    if (aggregated.gameProfit !== undefined && aggregated.gameProfit !== null) {
        dynamicExpression += ', gameProfit = :gp';
        dynamicValues[':gp'] = aggregated.gameProfit;
    }
    
    // --- Rake fields ---
    if (aggregated.rakeRevenue !== undefined && aggregated.rakeRevenue !== null) {
        dynamicExpression += ', rakeRevenue = :rr';
        dynamicValues[':rr'] = aggregated.rakeRevenue;
    }
    
    if (aggregated.projectedRakeRevenue !== undefined && aggregated.projectedRakeRevenue !== null) {
        dynamicExpression += ', projectedRakeRevenue = :prr';
        dynamicValues[':prr'] = aggregated.projectedRakeRevenue;
    }
    
    if (aggregated.rakeSubsidy !== undefined && aggregated.rakeSubsidy !== null) {
        dynamicExpression += ', rakeSubsidy = :rs';
        dynamicValues[':rs'] = aggregated.rakeSubsidy;
    }
    
    if (aggregated.fullRakeRealized !== undefined) {
        dynamicExpression += ', fullRakeRealized = :frr';
        dynamicValues[':frr'] = aggregated.fullRakeRealized;
    }
    
    // --- Stack/chip tracking from final day ---
    if (aggregated.playersRemaining !== null) {
        dynamicExpression += ', playersRemaining = :pr';
        dynamicValues[':pr'] = aggregated.playersRemaining;
    }
    
    if (aggregated.totalChipsInPlay !== null) {
        dynamicExpression += ', totalChipsInPlay = :tcip';
        dynamicValues[':tcip'] = aggregated.totalChipsInPlay;
    }
    
    if (aggregated.averagePlayerStack !== null) {
        dynamicExpression += ', averagePlayerStack = :aps';
        dynamicValues[':aps'] = aggregated.averagePlayerStack;
    }
    
    // --- Partial data tracking ---
    if (aggregated.isPartialData !== undefined) {
        dynamicExpression += ', isPartialData = :ipd';
        dynamicValues[':ipd'] = aggregated.isPartialData;
    }
    
    if (aggregated.missingFlightCount !== undefined) {
        dynamicExpression += ', missingFlightCount = :mfc';
        dynamicValues[':mfc'] = aggregated.missingFlightCount;
    }
    
    // *** NEW v2.0.0: Game tags (merged from children) ***
    if (aggregated.gameTags && aggregated.gameTags.length > 0) {
        dynamicExpression += ', gameTags = :gt';
        dynamicValues[':gt'] = aggregated.gameTags;
    }
    
    // Copy series fields from children if not set on parent
    const representativeChild = children.find(c => c.seriesCategory) || children[0];
    if (representativeChild) {
        if (!currentParentRecord.seriesCategory && representativeChild.seriesCategory) {
            dynamicExpression += ', seriesCategory = :sc';
            dynamicValues[':sc'] = representativeChild.seriesCategory;
        }
        if (!currentParentRecord.tournamentSeriesTitleId && representativeChild.tournamentSeriesTitleId) {
            dynamicExpression += ', tournamentSeriesTitleId = :stid';
            dynamicValues[':stid'] = representativeChild.tournamentSeriesTitleId;
        }
        if (!currentParentRecord.holidayType && representativeChild.holidayType) {
            dynamicExpression += ', holidayType = :ht';
            dynamicValues[':ht'] = representativeChild.holidayType;
        }
    }
    
    const finalExpression = baseExpression + dynamicExpression;
    const finalNames = {
        '#lca': '_lastChangedAt',
        '#v': '_version'
    };
    
    // *** NEW v2.0.0: Enhanced logging to show new fields ***
    console.log(`[Consolidator] Updating parent ${parentId} with ${Object.keys(dynamicValues).length} fields`);
    console.log(`[Consolidator] Key fields: gameYearMonth=${aggregated.gameYearMonth}, buyInTier=${aggregated.buyInTier}, totalBuyInsCollected=${aggregated.totalBuyInsCollected}`);
    
    await ddbDocClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: parentId },
        UpdateExpression: finalExpression,
        ExpressionAttributeValues: dynamicValues,
        ExpressionAttributeNames: finalNames
    }));
    
    console.log(`[Consolidator] Recalculated Parent ${parentId}:`, {
        totalUniquePlayers: actualUniquePlayers,
        totalEntries: calculatedTotalEntries,
        childCount: aggregated.childCount,
        // *** NEW v2.0.0: Log new aggregated fields ***
        gameYearMonth: aggregated.gameYearMonth,
        buyInTier: aggregated.buyInTier,
        totalBuyInsCollected: aggregated.totalBuyInsCollected,
        gameProfit: aggregated.gameProfit,
        totalDuration: aggregated.totalDuration
    });

    // Consolidate player data
    const tableNames = {
        PlayerEntry: PLAYER_ENTRY_TABLE,
        PlayerResult: PLAYER_RESULT_TABLE,
        PlayerSummary: getTableName('PlayerSummary'),
        PlayerVenue: getTableName('PlayerVenue')
    };
    
    try {
        const playerConsolidation = await consolidatePlayerDataForTournament(
            ddbDocClient,
            tableNames,
            parentId,
            currentParentRecord,
            children,
            { 
                applyAdjustments: true,
                createAggregates: true,
                consolidateResults: true
            }
        );
        
        console.log(`[Consolidator] Player consolidation complete:`, {
            uniquePlayers: playerConsolidation.uniquePlayers,
            adjustments: playerConsolidation.actions
        });
    } catch (playerError) {
        console.error(`[Consolidator] Player consolidation failed:`, playerError);
        // Don't fail the whole consolidation - tournament data is more critical
    }
};

/**
 * Creates or links parent record for a child game
 */
const processParentRecord = async (childGame, consolidationKey) => {
    // Find existing parent
    const parentQuery = await ddbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byConsolidationKey',
        KeyConditionExpression: 'consolidationKey = :key',
        FilterExpression: 'consolidationType = :ptype',
        ExpressionAttributeValues: {
            ':key': consolidationKey,
            ':ptype': 'PARENT'
        }
    }));

    let parentId = parentQuery.Items?.[0]?.id;
    let parentRecord = parentQuery.Items?.[0];

    // Create parent if it doesn't exist
    if (!parentId) {
        parentId = uuidv4();
        const now = new Date().toISOString();
        
        const parentData = buildParentRecord(childGame, consolidationKey, parentId);
        
        const newParent = {
            id: parentId,
            __typename: 'Game',
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            ...parentData
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: GAME_TABLE,
            Item: newParent
        }));
        
        console.log(`[Consolidator] Created parent: ${parentId} for key: ${consolidationKey}`);
        parentRecord = newParent;
    }

    // Link child if not already linked
    if (childGame.parentGameId !== parentId || childGame.consolidationType !== 'CHILD') {
        console.log(`[Consolidator] Linking ${childGame.id} to parent ${parentId}`);
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: GAME_TABLE,
            Key: { id: childGame.id },
            UpdateExpression: 'SET parentGameId = :pid, consolidationType = :ctype, consolidationKey = :ckey, updatedAt = :now, #lca = :lastChanged, #v = #v + :versionIncrement',
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ':pid': parentId,
                ':ctype': 'CHILD',
                ':ckey': consolidationKey,
                ':now': new Date().toISOString(),
                ':lastChanged': Date.now(),
                ':versionIncrement': 1
            }
        }));
        
        console.log(`[Consolidator] Successfully linked child ${childGame.id} as CHILD`);
    }

    // Trigger recalculation
    try {
        await recalculateParentTotals(parentId, parentRecord);
    } catch (recalcError) {
        console.error(`[Consolidator] Recalculation failed for parent ${parentId}:`, recalcError);
    }
};

/**
 * Handles DynamoDB stream events
 * NOW: Checks for meaningful changes before processing
 */
const handleDynamoDBStream = async (event) => {
    const totalRecords = event.Records?.length || 0;
    console.log(`[Consolidator] Processing ${totalRecords} stream records`);
    
    let processed = 0;
    let skipped = 0;
    
    for (const record of event.Records) {
        // ═══════════════════════════════════════════════════════════════
        // CONTENT HASH CHECK: Skip non-meaningful changes
        // ═══════════════════════════════════════════════════════════════
        const processCheck = shouldProcessStreamRecord(record);
        
        if (!processCheck.shouldProcess) {
            console.log(`[Consolidator] Skipping record: ${processCheck.reason}`);
            skipped++;
            continue;
        }
        
        const newImage = unmarshall(record.dynamodb?.NewImage || {});
        
        // Existing filters
        if (!newImage || newImage.consolidationType === 'PARENT') {
            skipped++;
            continue;
        }
        if (newImage.gameStatus === 'NOT_PUBLISHED') {
            skipped++;
            continue;
        }

        // Use pure function to check if multi-day
        const multiDayCheck = checkIsMultiDay(newImage);
        if (!multiDayCheck.isMultiDay) {
            console.log(`[Consolidator] Skipping non-multi-day: ${newImage.name} (${newImage.id})`);
            skipped++;
            continue;
        }

        console.log(`[Consolidator] Multi-day detected for: ${newImage.name}`, {
            id: newImage.id,
            detectionSource: multiDayCheck.detectionSource,
            dayNumber: newImage.dayNumber,
            flightLetter: newImage.flightLetter,
            seriesName: newImage.seriesName || '❌ MISSING',
            eventNumber: newImage.eventNumber,
            entityId: newImage.entityId,
            venueId: newImage.venueId,
            buyIn: newImage.buyIn
        });

        // Use pure function to generate key
        const keyResult = generateConsolidationKey(newImage);
        if (!keyResult.key) {
            console.warn(`[Consolidator] Skipping ${newImage.name}: ${keyResult.reason}`);
            skipped++;
            continue;
        }

        console.log(`[Consolidator] Processing: ${newImage.name} (${newImage.id})`, {
            key: keyResult.key,
            strategy: keyResult.strategy,
            confidence: keyResult.confidence
        });

        try {
            await processParentRecord(newImage, keyResult.key);
            processed++;
        } catch (error) {
            console.error(`[Consolidator] Error processing ${newImage.id}:`, error);
        }
    }
    
    console.log(`[Consolidator] Stream processing complete: ${processed} processed, ${skipped} skipped`);
};

// ===================================================================
// MAIN HANDLER - Routes to appropriate handler
// ===================================================================

exports.handler = async (event) => {
    console.log('[Consolidator] v2.0.0 - With full parent field population');
    
    try {
        // Route based on event type
        
        // GraphQL Query invocation (from AppSync)
        if (event.field === 'previewConsolidation' || event.fieldName === 'previewConsolidation') {
            console.log('[Consolidator] Handling previewConsolidation query');
            const input = event.arguments?.input || event.input;
            return await handlePreviewConsolidation(input);
        }
        
        // Direct invocation with previewConsolidation intent
        if (event.operation === 'previewConsolidation' && event.input) {
            console.log('[Consolidator] Handling direct previewConsolidation invocation');
            return await handlePreviewConsolidation(event.input);
        }
        
        // DynamoDB Stream event
        if (event.Records && Array.isArray(event.Records)) {
            console.log('[Consolidator] Handling DynamoDB stream event');
            return await handleDynamoDBStream(event);
        }
        
        // Unknown event type
        console.warn('[Consolidator] Unknown event type:', JSON.stringify(event).slice(0, 200));
        return {
            statusCode: 400,
            body: 'Unknown event type'
        };
        
    } catch (error) {
        console.error('[Consolidator] Critical Handler Error:', error);
        throw error;
    }
};