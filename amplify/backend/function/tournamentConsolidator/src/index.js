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

/*
 * TOURNAMENT CONSOLIDATOR LAMBDA
 * Trigger: DynamoDB Stream (Game Table)
 * Purpose: Aggregates multi-day flights into a single Parent Game record.
 * Logic:   Retroactive Upsert, Deduplication of Entries, Results Sync.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { LambdaMonitoring } = require('./lambda-monitoring');

// --- CONFIGURATION ---
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Initialize Monitoring
const DEFAULT_ENTITY_ID = 'system-consolidator'; // Fallback ID for system operations
const monitoring = new LambdaMonitoring('tournamentConsolidator', DEFAULT_ENTITY_ID);

// Wrap the client to automatically track DynamoDB calls
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// Environment Variables
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const PLAYER_ENTRY_TABLE = process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME;
const PLAYER_RESULT_TABLE = process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME;

// --- HELPER UTILITIES ---

/**
 * Normalizes strings for key generation (removes special chars, uppercase)
 */
const clean = (str) => str?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';

/**
 * Clean Parent Name (removes "Day 1A" suffix)
 */
const deriveParentName = (childName) => {
    return childName
        .replace(/\s*[-–]\s*(Day|Flight)\s*(\d+|[A-Z])+/gi, '')
        .replace(/\s*\b(Day|Flight)\s*(\d+|[A-Z])+\b/gi, '')
        .replace(/\s*[-–]\s*Final\s*Day/gi, '')
        .trim();
};

/**
 * Heuristic: Is this game a flight or final day?
 */
const checkIsMultiDay = (game) => {
    if (game.dayNumber || game.flightLetter) return true;
    if (game.finalDay === true) return true;
    
    // Regex fallback for names like "WSOP Main Event - Day 1A"
    const name = game.name || '';
    const dayPattern = /\b(Day|Flight)\s*(\d+|[A-Z])\b/i;
    const finalPattern = /\b(Final\s*Day|Day\s*2)\b/i;
    
    return dayPattern.test(name) || finalPattern.test(name);
};

/**
 * Generates the "Glue" key to link flights together
 */
const generateConsolidationKey = (game) => {
    // Strategy A: Explicit Series + Event (Best)
    if (game.tournamentSeriesId && game.eventNumber) {
        return `SERIES_${game.tournamentSeriesId}_EVT_${game.eventNumber}`;
    }

    // Strategy B: Venue + BuyIn + Name Stem (Fallback)
    if (game.venueId && game.buyIn) {
        const rootName = game.name
            .replace(/\s*[-–]\s*(Day|Flight)\s*(\d+|[A-Z])+/gi, '')
            .replace(/\s*\b(Day|Flight)\s*(\d+|[A-Z])+\b/gi, '')
            .replace(/\s*[-–]\s*Final\s*Day/gi, '')
            .trim();
        
        return `VENUE_${game.venueId}_BI_${game.buyIn}_NAME_${clean(rootName)}`;
    }

    return null;
};

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

// --- LOGIC FUNCTIONS ---

const checkPartialData = (children, parentRecord, calculatedEntries) => {
    const hasDay1 = children.some(c => c.dayNumber === 1 || /Day\s*1/i.test(c.name));
    const hasDay2 = children.some(c => c.dayNumber === 2 || /Day\s*2/i.test(c.name));
    
    let isPartial = false;
    let missingCount = 0;

    // Logic: Have Day 2 but no Day 1?
    if (hasDay2 && !hasDay1) {
        isPartial = true;
        missingCount = 1;
    }

    // Logic: Scraper text says "500 Entries" but we only calculated 50?
    // We trust the Final Day record for the 'Expected' count
    const finalDay = children.find(c => c.finalDay === true);
    const expected = finalDay?.totalEntries || parentRecord?.expectedTotalEntries || 0;
    
    if (expected > 0 && calculatedEntries < (expected * 0.9)) {
        isPartial = true;
    }

    return { isPartial, missingCount };
};

const syncParentResults = async (parentId, realResults) => {
    if (!realResults || realResults.length === 0) return;

    for (const res of realResults) {
        // Deterministic ID to prevent duplicates on re-runs
        const cleanName = res.name?.replace(/[^a-zA-Z0-9]/g, '') || 'UNKNOWN';
        const parentResultId = `CONS_${parentId}_${res.rank}_${cleanName}`;
        const now = new Date().toISOString();

        try {
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: PLAYER_RESULT_TABLE,
                Item: {
                    id: parentResultId,
                    gameId: parentId,
                    playerId: res.playerId, // Assuming ID is present
                    
                    // Stats
                    finishingPlace: res.rank,
                    prizeWon: (res.winnings || 0) > 0,
                    amountWon: res.winnings || 0,
                    pointsEarned: res.points || 0,
                    
                    gameStartDateTime: res.gameStartDateTime,
                    
                    // CRITICAL: Mark as consolidated
                    recordType: 'CONSOLIDATED',
                    isConsolidatedRecord: true, // Keeping legacy bool if needed
                    
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

const consolidateEntries = async (parentId, children) => {
    // Sort chronologically
    const sortedChildren = children.sort((a, b) => 
        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
    );

    // Track player state: ID -> { Survived last flight?, Count of Buyins }
    const playerHistory = new Map();
    
    for (const game of sortedChildren) {
        // Fetch all entries for this specific flight
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
                // First sighting of player
                // If it is Day 2 (Day > 1) and not a Flight (e.g. 1A, 1B), assume Direct Buy-in
                const isDay2 = (game.dayNumber || 0) > 1;
                const isFlight = !!game.flightLetter;
                
                if (isDay2 && !isFlight) {
                    newType = 'DIRECT_BUYIN';
                } else {
                    newType = 'INITIAL';
                }
                currentState = { hasSurvived: false, totalBuyIns: 1 };
            } else {
                // Seen player before
                if (currentState.hasSurvived) {
                    // They survived previous flight, this record is just them continuing
                    newType = 'QUALIFIED_CONTINUATION';
                } else {
                    // They busted previously, this is a Re-entry
                    newType = 'REENTRY';
                    currentState.totalBuyIns += 1;
                }
            }

            // Determine survival based on entry status
            // If they are PLAYING or COMPLETED (not ELIMINATED), they survive to next stage
            const survives = entry.status !== 'ELIMINATED';
            currentState.hasSurvived = survives;
            
            playerHistory.set(pid, currentState);

            // Update DB if the calculated type differs from stored type
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
        // Add up all buy-ins (Initial + Re-entries + Direct Buy-ins)
        totalEntries += p.totalBuyIns;
    });

    return { uniqueRunners, calculatedTotalEntries: totalEntries };
};

const recalculateParentTotals = async (parentId, currentParentRecord) => {
    // 1. Fetch All Sibling Flights
    const children = await fetchAllItems({
        TableName: GAME_TABLE,
        IndexName: 'byParentGame',
        KeyConditionExpression: 'parentGameId = :pid',
        ExpressionAttributeValues: { ':pid': parentId }
    });

    if (children.length === 0) return;

    // 2. Run Entry Deduplication (The Survivor Check)
    const { calculatedTotalEntries, uniqueRunners } = await consolidateEntries(parentId, children);

    // 3. Aggregate Financials & Dates
    let totalPrizes = 0;
    let totalRebuys = 0;
    let totalAddons = 0;
    let earliestStart = new Date(8640000000000000).getTime();
    let latestEnd = 0;
    let finalDayChild = null;

    for (const child of children) {
        // Simple sums
        totalRebuys += (child.totalRebuys || 0);
        totalAddons += (child.totalAddons || 0);
        
        // Prizepool: assume the largest prizepool found is the "Total" (usually on Final Day)
        if ((child.prizepool || 0) > totalPrizes) totalPrizes = child.prizepool;

        // Date Range
        const start = new Date(child.gameStartDateTime).getTime();
        if (start < earliestStart) earliestStart = start;
        if (child.gameEndDateTime) {
            const end = new Date(child.gameEndDateTime).getTime();
            if (end > latestEnd) latestEnd = end;
        }

        // Identify Final Day
        if (child.finalDay === true || child.gameStatus === 'FINISHED') {
            if (child.finalDay || !finalDayChild) finalDayChild = child;
        }
    }

    // 4. Sync Winners (Results) to Parent
    if (finalDayChild && finalDayChild.results) {
        await syncParentResults(parentId, finalDayChild.results);
    }

    // 5. Determine Parent Status
    let parentStatus = 'RUNNING';
    if (finalDayChild && finalDayChild.gameStatus === 'FINISHED') {
        parentStatus = 'FINISHED';
    } else if (children.every(c => ['SCHEDULED', 'INITIATING'].includes(c.gameStatus))) {
        parentStatus = 'SCHEDULED';
    }

    // 6. Check for Missing Data
    const { isPartial, missingCount } = checkPartialData(children, currentParentRecord, calculatedTotalEntries);

    // 7. Update Parent Record
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
            ':tr': totalRebuys,
            ':ta': totalAddons,
            ':pp': totalPrizes,
            ':start': new Date(earliestStart).toISOString(),
            ':end': latestEnd > 0 ? new Date(latestEnd).toISOString() : null,
            ':status': parentStatus,
            ':partial': isPartial,
            ':miss': missingCount,
            ':now': new Date().toISOString()
        }
    }));
    
    console.log(`[Consolidator] Recalculated Parent ${parentId}. Entries: ${calculatedTotalEntries}, Partial: ${isPartial}`);
};

const processParentRecord = async (childGame, consolidationKey) => {
    // A. Find existing Parent using the String Index
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

    // B. Create Parent if it doesn't exist
    if (!parentId) {
        parentId = uuidv4();
        const now = new Date().toISOString();
        
        parentRecord = {
            id: parentId,
            consolidationKey: consolidationKey,
            consolidationType: 'PARENT', 
            
            name: deriveParentName(childGame.name),
            
            // Copy immutable traits from first child
            gameType: childGame.gameType,
            gameVariant: childGame.gameVariant,
            venueId: childGame.venueId,
            buyIn: childGame.buyIn,
            rake: childGame.rake,
            entityId: childGame.entityId,
            hasGuarantee: childGame.hasGuarantee,
            guaranteeAmount: childGame.guaranteeAmount,
            tournamentSeriesId: childGame.tournamentSeriesId,
            seriesName: childGame.seriesName,
            isSeries: true,
            eventNumber: childGame.eventNumber,

            // Initial State
            isPartialData: true, 
            gameStatus: 'RUNNING',
            
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

    // C. Link this Child to the Parent
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

    // D. Trigger Global Recalculation for this Parent
    await recalculateParentTotals(parentId, parentRecord);
};

// --- MAIN HANDLER ---

exports.handler = async (event) => {
    // Set Entity ID for monitoring context if possible (from first record)
    if (event.Records && event.Records.length > 0) {
        const firstImage = DynamoDBDocumentClient.unmarshallAttributes(event.Records[0].dynamodb?.NewImage || {});
        if (firstImage && firstImage.entityId) {
            monitoring.entityId = firstImage.entityId;
        }
    }

    try {
        for (const record of event.Records) {
            if (record.eventName === 'REMOVE') continue;

            // Unmarshall DynamoDB JSON to standard object
            const newImage = DynamoDBDocumentClient.unmarshallAttributes(record.dynamodb?.NewImage);
            
            // 1. Filter: Ignore Parents and Unpublished Games
            if (!newImage || newImage.consolidationType === 'PARENT') continue; 
            if (newImage.gameStatus === 'NOT_PUBLISHED') continue;

            // 2. Filter: Only process Multi-Day components
            const isMultiDay = checkIsMultiDay(newImage);
            if (!isMultiDay) continue;

            // 3. Generate Link Key
            const consolidationKey = generateConsolidationKey(newImage);
            if (!consolidationKey) {
                console.warn(`[Consolidator] Skipping ${newImage.name}: Insufficient data to generate key.`);
                continue;
            }

            console.log(`[Consolidator] Processing: ${newImage.name} (${newImage.id}) Key: ${consolidationKey}`);

            // 4. Core Processing
            try {
                await processParentRecord(newImage, consolidationKey);
            } catch (error) {
                console.error(`[Consolidator] Error processing ${newImage.id}:`, error);
                monitoring.trackOperation('PROCESS_ERROR', 'Game', newImage.id, { error: error.message });
                // We do not throw error here to avoid blocking the stream for other records
            }
        }
    } catch (error) {
        console.error('[Consolidator] Critical Handler Error:', error);
        monitoring.trackOperation('HANDLER_CRITICAL', 'Handler', 'main', { error: error.message });
        throw error; // Retry the batch
    } finally {
        // Ensure metrics are flushed before Lambda freezes
        if (monitoring) {
            await monitoring.flush();
        }
    }
};