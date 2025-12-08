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
 * * This Lambda now handles TWO types of invocations:
 * * 1. DynamoDB Stream Trigger (Original)
 * - Triggered when Game table changes
 * - Performs actual consolidation (creates parents, links children)
 * * 2. GraphQL Query: previewConsolidation (NEW)
 * - Called from frontend to preview what will happen
 * - Returns analysis without modifying any data
 * * The core consolidation LOGIC is extracted to ./consolidation-logic.js
 * so it can be used by both handlers without duplication.
 * * FIX: Added sourceUrl to parent records for bySourceUrl GSI compatibility
 * FIX: Proper null handling in DynamoDB UpdateExpressions
 * FIX: Children now properly marked as CHILD consolidationType
 * FIX: (v2) Added ExpressionAttributeNames handling for underscored fields (_lastChangedAt, _version)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
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
    
    // *** ENHANCED LOGGING: Track all consolidation-relevant fields ***
    console.log('[Consolidator:Preview] Analyzing:', {
        name: gameData.name,
        venueId: gameData.venueId,
        buyIn: gameData.buyIn,
        tournamentSeriesId: gameData.tournamentSeriesId,
        eventNumber: gameData.eventNumber,
        // *** NEW: Log fields needed for ENTITY_SERIES_EVENT strategy ***
        seriesName: gameData.seriesName || '❌ MISSING',
        isMainEvent: gameData.isMainEvent || false,
        entityId: gameData.entityId || '❌ MISSING',
        dayNumber: gameData.dayNumber,
        flightLetter: gameData.flightLetter
    });
    
    // *** NEW: Warn if seriesName is missing but isSeries is true ***
    if (gameData.isSeries && !gameData.seriesName) {
        console.warn('[Consolidator:Preview] ⚠️ isSeries=true but seriesName is missing! Will fall back to lower confidence strategy.');
    }
    
    // Get the preview from pure logic
    const preview = previewConsolidation(gameData);
    
    // *** NEW: Log the strategy that was selected ***
    console.log('[Consolidator:Preview] Strategy selected:', {
        willConsolidate: preview.willConsolidate,
        strategy: preview.keyStrategy,
        confidence: preview.keyConfidence,
        consolidationKey: preview.consolidationKey,
        derivedParentName: preview.derivedParentName
    });
    
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
        totalUniquePlayers: newGameData.totalUniquePlayers,
        totalEntries: newGameData.totalEntries,
        totalRebuys: newGameData.totalRebuys,
        totalAddons: newGameData.totalAddons,
        prizepoolPaid: newGameData.prizepoolPaid,
        prizepoolCalculated: newGameData.prizepoolCalculated,
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
        totalUniquePlayers: newGameData.totalUniquePlayers || 0,
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
        projectedPrizepoolPaid: projectedTotals.prizepoolPaid,
        projectedPrizepoolCalculated: projectedTotals.prizepoolCalculated
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
            totalUniquePlayers: s.totalUniquePlayers,
            totalEntries: s.totalEntries,
            finalDay: s.finalDay
        })) : null,
        projectedTotals: {
            totalUniquePlayers: projectedTotals.totalUniquePlayers,
            totalEntries: projectedTotals.totalEntries,
            totalRebuys: projectedTotals.totalRebuys,
            totalAddons: projectedTotals.totalAddons,
            prizepoolPaid: projectedTotals.prizepoolPaid,
            prizepoolCalculated: projectedTotals.prizepoolCalculated,
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
                // _lastChangedAt and _version are reserved/special, should ideally use aliases
                // but UpdateCommand for entries has worked so far. 
                // However, let's be safe and use aliases here too for best practice.
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: PLAYER_ENTRY_TABLE,
                    Key: { id: entry.id },
                    UpdateExpression: "SET entryType = :et, #lca = :lastChanged ADD #v :versionIncrement",
                    ExpressionAttributeNames: {
                        "#lca": "_lastChangedAt",
                        "#v": "_version"
                    },
                    ExpressionAttributeValues: { 
                        ":et": newType,
                        ":lastChanged": Date.now(),
                        ":versionIncrement": 1
                    }
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
 * *** FIX: Helper to build dynamic UpdateExpression with proper null handling ***
 * *** FIX V2: Now properly aliases fields starting with underscore ***
 * * DynamoDB doesn't accept null values in ExpressionAttributeValues.
 * This helper builds the expression dynamically, only including non-null fields.
 * Fields with null values are moved to a REMOVE clause instead.
 */
const buildDynamicUpdateExpression = (updates) => {
    const setExpressions = [];
    const removeExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};
    
    for (const [field, value] of Object.entries(updates)) {
        // Skip undefined values entirely
        if (value === undefined) continue;
        
        // Handle reserved words or internal fields (starting with _)
        let attrName = field;
        if (field.startsWith('_')) {
            // Create alias like #lastChangedAt for _lastChangedAt
            const alias = `#${field.replace(/[^a-zA-Z0-9]/g, '')}`;
            expressionAttributeNames[alias] = field;
            attrName = alias;
        }

        const placeholder = `:${field.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        if (value === null) {
            // NULL values should be removed from DynamoDB
            removeExpressions.push(attrName);
        } else {
            setExpressions.push(`${attrName} = ${placeholder}`);
            expressionAttributeValues[placeholder] = value;
        }
    }
    
    // Build the expression parts
    let expression = '';
    
    if (setExpressions.length > 0) {
        expression += `SET ${setExpressions.join(', ')}`;
    }
    
    if (removeExpressions.length > 0) {
        if (expression) expression += ' ';
        expression += `REMOVE ${removeExpressions.join(', ')}`;
    }
    
    return {
        expression,
        values: expressionAttributeValues,
        names: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
    };
};

/**
 * *** FIX: Recalculates parent totals from all children with proper null handling ***
 */
const recalculateParentTotals = async (parentId, currentParentRecord) => {
    const children = await fetchAllItems({
        TableName: GAME_TABLE,
        IndexName: 'byParentGame',
        KeyConditionExpression: 'parentGameId = :pid',
        ExpressionAttributeValues: { ':pid': parentId }
    });

    if (children.length === 0) {
        console.log(`[Consolidator] No children found for parent ${parentId}, skipping recalculation`);
        return;
    }

    console.log(`[Consolidator] Recalculating parent ${parentId} with ${children.length} children`);

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

    // *** FIX: Build update with proper null handling ***
    // Ensure GSI key fields are never null
    const safeStart = aggregated.earliestStart || currentParentRecord?.gameStartDateTime || new Date().toISOString();
    
    // Build the update fields - the helper will handle nulls properly
    // _lastChangedAt will be automatically aliased by the helper
    const updateFields = {
        totalEntries: calculatedTotalEntries,
        actualCalculatedUniquePlayers: uniqueRunners,
        totalRebuys: aggregated.totalRebuys || 0,
        totalAddons: aggregated.totalAddons || 0,
        prizepoolPaid: aggregated.prizepoolPaid || 0,
        prizepoolCalculated: aggregated.prizepoolCalculated || 0,
        totalRake: aggregated.totalRake || 0,
        buyInsByTotalEntries: aggregated.buyInsByTotalEntries || 0,
        gameProfitLoss: aggregated.gameProfitLoss || 0,
        startingStack: aggregated.startingStack || 0,
        playersRemaining: aggregated.playersRemaining,        // May be null - helper handles this
        totalChipsInPlay: aggregated.totalChipsInPlay,        // May be null - helper handles this
        averagePlayerStack: aggregated.averagePlayerStack,    // May be null - helper handles this
        guaranteeOverlay: aggregated.guaranteeOverlay || 0,
        guaranteeSurplus: aggregated.guaranteeSurplus || 0,
        gameStartDateTime: safeStart,
        gameEndDateTime: aggregated.latestEnd,                // May be null - helper handles this
        totalDuration: aggregated.totalDuration,              // May be null - helper handles this
        gameStatus: aggregated.parentStatus || 'RUNNING',
        isPartialData: aggregated.isPartialData,
        missingFlightCount: aggregated.missingFlightCount,
        updatedAt: new Date().toISOString(),
        _lastChangedAt: Date.now()
    };
    
    const { expression: dynamicExpression, values: dynamicValues, names: dynamicNames } = buildDynamicUpdateExpression(updateFields);
    
    // Add version increment (this is an ADD operation, handled separately from SET/REMOVE)
    // We must ensure _version is aliased too
    const finalExpression = `${dynamicExpression} ADD #v :versionIncrement`;
    dynamicValues[':versionIncrement'] = 1;
    
    // Merge names, ensuring #v is present
    const finalNames = {
        ...(dynamicNames || {}),
        '#v': '_version'
    };
    
    console.log(`[Consolidator] Updating parent with expression: ${finalExpression.substring(0, 100)}...`);
    
    await monitoredDdbDocClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: parentId },
        UpdateExpression: finalExpression,
        ExpressionAttributeValues: dynamicValues,
        ExpressionAttributeNames: finalNames
    }));
    
    console.log(`[Consolidator] Recalculated Parent ${parentId}. Entries: ${calculatedTotalEntries}, Children: ${aggregated.childCount}, Partial: ${aggregated.isPartialData}`);
};

/**
 * *** FIX: Creates or links parent record for a child game ***
 * Now properly separates parent creation from child linking to ensure
 * children are always marked as CHILD even if recalculation fails.
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
        
        // *** FIX: Pass parentId to buildParentRecord for sourceUrl generation ***
        // This is required because the bySourceUrl GSI cannot have NULL partition keys
        const parentData = buildParentRecord(childGame, consolidationKey, parentId);
        
        parentRecord = {
            id: parentId,
            ...parentData,
            createdAt: now,
            updatedAt: now,
            __typename: 'Game',
            // Required Amplify DataStore fields
            _version: 1,
            _lastChangedAt: Date.now(),
            _deleted: null
        };

        // *** FIX: Remove null/undefined values to prevent GSI validation errors ***
        // DynamoDB GSIs reject explicit NULL values - fields must be absent instead
        // This affects: tournamentSeriesId, parentGameId, and other optional GSI partition keys
        const cleanedRecord = Object.fromEntries(
            Object.entries(parentRecord).filter(([_, value]) => value !== null && value !== undefined)
        );

        await monitoredDdbDocClient.send(new PutCommand({
            TableName: GAME_TABLE,
            Item: cleanedRecord
        }));
        console.log(`[Consolidator] Created New Parent: ${parentId} with sourceUrl: ${cleanedRecord.sourceUrl}`);
    }

    // *** FIX: Link child to parent BEFORE recalculation ***
    // This ensures the child is marked as CHILD even if recalculation fails
    if (childGame.parentGameId !== parentId || childGame.consolidationType !== 'CHILD') {
        console.log(`[Consolidator] Linking child ${childGame.id} to parent ${parentId}`);
        
        // *** FIX V2: Use ExpressionAttributeNames for _lastChangedAt and _version to prevent syntax errors ***
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: GAME_TABLE,
            Key: { id: childGame.id },
            UpdateExpression: 'SET parentGameId = :pid, consolidationType = :ctype, consolidationKey = :ckey, updatedAt = :now, #lca = :lastChanged ADD #v :versionIncrement',
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v':   '_version'
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

    // *** FIX: Trigger recalculation in a separate try-catch ***
    // This way, even if recalculation fails, the child is still linked
    try {
        await recalculateParentTotals(parentId, parentRecord);
    } catch (recalcError) {
        console.error(`[Consolidator] Recalculation failed for parent ${parentId}, but child ${childGame.id} was still linked:`, recalcError);
        // Don't re-throw - the child linking was successful
    }
};

/**
 * Handles DynamoDB stream events
 */
const handleDynamoDBStream = async (event) => {
    console.log(`[Consolidator] Processing ${event.Records?.length || 0} stream records`);
    
    for (const record of event.Records) {
        if (record.eventName === 'REMOVE') continue;

        const newImage = unmarshall(record.dynamodb?.NewImage || {});
        
        // Filters
        if (!newImage || newImage.consolidationType === 'PARENT') continue; 
        if (newImage.gameStatus === 'NOT_PUBLISHED') continue;

        // Use pure function to check if multi-day
        const multiDayCheck = checkIsMultiDay(newImage);
        if (!multiDayCheck.isMultiDay) {
            console.log(`[Consolidator] Skipping non-multi-day: ${newImage.name} (${newImage.id})`);
            continue;
        }

        // *** ENHANCED LOGGING: Show all fields used for key generation ***
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
            continue;
        }

        // *** ENHANCED LOGGING: Show strategy selection ***
        console.log(`[Consolidator] Processing: ${newImage.name} (${newImage.id})`, {
            key: keyResult.key,
            strategy: keyResult.strategy,
            confidence: keyResult.confidence
        });

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
        const firstImage = unmarshall(event.Records[0].dynamodb?.NewImage || {});
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