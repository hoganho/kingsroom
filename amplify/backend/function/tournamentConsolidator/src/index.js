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
 * 
 * This Lambda now handles TWO types of invocations:
 * 
 * 1. DynamoDB Stream Trigger (Original)
 *    - Triggered when Game table changes
 *    - Performs actual consolidation (creates parents, links children)
 * 
 * 2. GraphQL Query: previewConsolidation (NEW)
 *    - Called from frontend to preview what will happen
 *    - Returns analysis without modifying any data
 * 
 * The core consolidation LOGIC is extracted to ./consolidation-logic.js
 * so it can be used by both handlers without duplication.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { LambdaMonitoring } = require('./lambda-monitoring');

// Import the extracted consolidation logic
const {
    checkIsMultiDay,
    generateConsolidationKey,
    deriveParentName,
    previewConsolidation,
    calculateAggregatedTotals,
    buildParentRecord
} = require('./consolidation-logic');

// --- CONFIGURATION ---
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Initialize Monitoring
const DEFAULT_ENTITY_ID = 'system-consolidator';
const monitoring = new LambdaMonitoring('tournamentConsolidator', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// Environment Variables
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const PLAYER_ENTRY_TABLE = process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME;
const PLAYER_RESULT_TABLE = process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME;

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
        eventNumber: gameData.eventNumber
    });
    
    // Get the preview from pure logic
    const preview = previewConsolidation(gameData);
    
    // Build response
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
    
    // If will consolidate, fetch additional details from database
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
    // Log what numeric data we received for projection
    console.log('[Consolidator:Preview] Numeric fields for projection:', {
        totalEntries: newGameData.totalEntries,
        totalRebuys: newGameData.totalRebuys,
        totalAddons: newGameData.totalAddons,
        prizepool: newGameData.prizepool,
        gameStatus: newGameData.gameStatus
    });

    // Find existing parent
    const parentQuery = await monitoredDdbDocClient.send(new QueryCommand({
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
    
    // Fetch existing siblings
    let siblings = [];
    let siblingCount = 0;
    
    if (existingParent) {
        const siblingsQuery = await monitoredDdbDocClient.send(new QueryCommand({
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
    
    // Calculate projected totals (existing siblings + this new game)
    // Normalize the new game data to ensure numeric fields are included
    const normalizedNewGame = {
        ...newGameData,
        totalEntries: newGameData.totalEntries || 0,
        totalRebuys: newGameData.totalRebuys || 0,
        totalAddons: newGameData.totalAddons || 0,
        prizepool: newGameData.prizepool || 0
    };
    
    const allChildren = [...siblings, normalizedNewGame];
    const projectedTotals = calculateAggregatedTotals(allChildren);
    
    console.log('[Consolidator:Preview] Projected totals:', {
        siblingCount,
        totalChildrenForProjection: allChildren.length,
        projectedEntries: projectedTotals.totalEntries,
        projectedPrizepool: projectedTotals.prizepool
    });
    
    // Build consolidation details
    const details = {
        consolidationKey,
        keyStrategy: consolidationKey.startsWith('SERIES_') 
            ? 'SERIES_EVENT' 
            : 'VENUE_BUYIN_NAME',
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
            totalEntries: s.totalEntries,
            finalDay: s.finalDay
        })) : null,
        projectedTotals: {
            totalEntries: projectedTotals.totalEntries,
            totalRebuys: projectedTotals.totalRebuys,
            totalAddons: projectedTotals.totalAddons,
            prizepool: projectedTotals.prizepool,
            earliestStart: projectedTotals.earliestStart,
            latestEnd: projectedTotals.latestEnd,
            projectedStatus: projectedTotals.parentStatus,
            isPartialData: projectedTotals.isPartialData,
            missingFlightCount: projectedTotals.missingFlightCount
        }
    };
    
    return details;
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
        const response = await monitoredDdbDocClient.send(new QueryCommand({
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

    for (const res of realResults) {
        const cleanName = res.name?.replace(/[^a-zA-Z0-9]/g, '') || 'UNKNOWN';
        const parentResultId = `CONS_${parentId}_${res.rank}_${cleanName}`;
        const now = new Date().toISOString();

        try {
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: PLAYER_RESULT_TABLE,
                Item: {
                    id: parentResultId,
                    gameId: parentId,
                    playerId: res.playerId,
                    finishingPlace: res.rank,
                    prizeWon: (res.winnings || 0) > 0,
                    amountWon: res.winnings || 0,
                    pointsEarned: res.points || 0,
                    gameStartDateTime: res.gameStartDateTime,
                    recordType: 'CONSOLIDATED',
                    isConsolidatedRecord: true,
                    createdAt: now,
                    updatedAt: now,
                    __typename: 'PlayerResult'
                }
            }));
        } catch (e) {
            console.warn(`[Consolidator] Failed to sync result for ${res.name}`, e);
        }
    }
};

/**
 * Consolidates entries across flights with deduplication
 */
const consolidateEntries = async (parentId, children) => {
    const sortedChildren = children.sort((a, b) => 
        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
    );

    const playerHistory = new Map();
    
    for (const game of sortedChildren) {
        const entries = await fetchAllItems({
            TableName: PLAYER_ENTRY_TABLE,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gid',
            ExpressionAttributeValues: { ':gid': game.id }
        });
        
        for (const entry of entries) {
            const pid = entry.playerId;
            let currentState = playerHistory.get(pid);
            let newType = 'INITIAL';

            if (!currentState) {
                const isDay2 = (game.dayNumber || 0) > 1;
                const isFlight = !!game.flightLetter;
                
                if (isDay2 && !isFlight) {
                    newType = 'DIRECT_BUYIN';
                } else {
                    newType = 'INITIAL';
                }
                currentState = { hasSurvived: false, totalBuyIns: 1 };
            } else {
                if (currentState.hasSurvived) {
                    newType = 'QUALIFIED_CONTINUATION';
                } else {
                    newType = 'REENTRY';
                    currentState.totalBuyIns += 1;
                }
            }

            const survives = entry.status !== 'ELIMINATED';
            currentState.hasSurvived = survives;
            playerHistory.set(pid, currentState);

            if (entry.entryType !== newType) {
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: PLAYER_ENTRY_TABLE,
                    Key: { id: entry.id },
                    UpdateExpression: "SET entryType = :et",
                    ExpressionAttributeValues: { ":et": newType }
                }));
            }
        }
    }

    let uniqueRunners = 0;
    let totalEntries = 0;
    
    playerHistory.forEach(p => {
        uniqueRunners++;
        totalEntries += p.totalBuyIns;
    });

    return { uniqueRunners, calculatedTotalEntries: totalEntries };
};

/**
 * Recalculates parent totals from all children
 */
const recalculateParentTotals = async (parentId, currentParentRecord) => {
    const children = await fetchAllItems({
        TableName: GAME_TABLE,
        IndexName: 'byParentGame',
        KeyConditionExpression: 'parentGameId = :pid',
        ExpressionAttributeValues: { ':pid': parentId }
    });

    if (children.length === 0) return;

    const { calculatedTotalEntries, uniqueRunners } = await consolidateEntries(parentId, children);
    
    // Use pure function for aggregation logic
    const aggregated = calculateAggregatedTotals(
        children, 
        currentParentRecord?.expectedTotalEntries
    );

    // Sync results from final day
    if (aggregated.finalDayChild && aggregated.finalDayChild.results) {
        await syncParentResults(parentId, aggregated.finalDayChild.results);
    }

    // Update parent record
    await monitoredDdbDocClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: parentId },
        UpdateExpression: `
            SET totalEntries = :te,
                actualCalculatedEntries = :ace,
                totalRebuys = :tr, 
                totalAddons = :ta, 
                prizepool = :pp,
                gameStartDateTime = :start,
                gameEndDateTime = :end,
                gameStatus = :status,
                isPartialData = :partial,
                missingFlightCount = :miss,
                updatedAt = :now
        `,
        ExpressionAttributeValues: {
            ':te': calculatedTotalEntries,
            ':ace': uniqueRunners,
            ':tr': aggregated.totalRebuys,
            ':ta': aggregated.totalAddons,
            ':pp': aggregated.prizepool,
            ':start': aggregated.earliestStart,
            ':end': aggregated.latestEnd,
            ':status': aggregated.parentStatus,
            ':partial': aggregated.isPartialData,
            ':miss': aggregated.missingFlightCount,
            ':now': new Date().toISOString()
        }
    }));
    
    console.log(`[Consolidator] Recalculated Parent ${parentId}. Entries: ${calculatedTotalEntries}, Partial: ${aggregated.isPartialData}`);
};

/**
 * Creates or links parent record for a child game
 */
const processParentRecord = async (childGame, consolidationKey) => {
    // Find existing parent
    const parentQuery = await monitoredDdbDocClient.send(new QueryCommand({
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
        
        // Use pure function to build parent data
        const parentData = buildParentRecord(childGame, consolidationKey);
        
        parentRecord = {
            id: parentId,
            ...parentData,
            createdAt: now,
            updatedAt: now,
            __typename: 'Game'
        };

        await monitoredDdbDocClient.send(new PutCommand({
            TableName: GAME_TABLE,
            Item: parentRecord
        }));
        console.log(`[Consolidator] Created New Parent: ${parentId}`);
    }

    // Link child to parent
    if (childGame.parentGameId !== parentId || childGame.consolidationType !== 'CHILD') {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: GAME_TABLE,
            Key: { id: childGame.id },
            UpdateExpression: 'SET parentGameId = :pid, consolidationType = :ctype, consolidationKey = :ckey',
            ExpressionAttributeValues: {
                ':pid': parentId,
                ':ctype': 'CHILD',
                ':ckey': consolidationKey
            }
        }));
    }

    // Trigger recalculation
    await recalculateParentTotals(parentId, parentRecord);
};

/**
 * Handles DynamoDB stream events
 */
const handleDynamoDBStream = async (event) => {
    for (const record of event.Records) {
        if (record.eventName === 'REMOVE') continue;

        const newImage = DynamoDBDocumentClient.unmarshallAttributes(record.dynamodb?.NewImage);
        
        // Filters
        if (!newImage || newImage.consolidationType === 'PARENT') continue; 
        if (newImage.gameStatus === 'NOT_PUBLISHED') continue;

        // Use pure function to check if multi-day
        const multiDayCheck = checkIsMultiDay(newImage);
        if (!multiDayCheck.isMultiDay) continue;

        // Use pure function to generate key
        const keyResult = generateConsolidationKey(newImage);
        if (!keyResult.key) {
            console.warn(`[Consolidator] Skipping ${newImage.name}: ${keyResult.reason}`);
            continue;
        }

        console.log(`[Consolidator] Processing: ${newImage.name} (${newImage.id}) Key: ${keyResult.key}`);

        try {
            await processParentRecord(newImage, keyResult.key);
        } catch (error) {
            console.error(`[Consolidator] Error processing ${newImage.id}:`, error);
            monitoring.trackOperation('PROCESS_ERROR', 'Game', newImage.id, { error: error.message });
        }
    }
};

// ===================================================================
// MAIN HANDLER - Routes to appropriate handler
// ===================================================================

exports.handler = async (event) => {
    // Set Entity ID for monitoring
    if (event.Records && event.Records.length > 0) {
        const firstImage = DynamoDBDocumentClient.unmarshallAttributes(event.Records[0].dynamodb?.NewImage || {});
        if (firstImage && firstImage.entityId) {
            monitoring.entityId = firstImage.entityId;
        }
    }

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
        monitoring.trackOperation('HANDLER_CRITICAL', 'Handler', 'main', { error: error.message });
        throw error;
    } finally {
        if (monitoring) {
            await monitoring.flush();
        }
    }
};