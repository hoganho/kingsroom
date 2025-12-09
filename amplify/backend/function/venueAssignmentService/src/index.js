/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_PLAYERENTRYTABLE_ARN
    API_KINGSROOM_PLAYERENTRYTABLE_NAME
    API_KINGSROOM_PLAYERRESULTTABLE_ARN
    API_KINGSROOM_PLAYERRESULTTABLE_NAME
    API_KINGSROOM_PLAYERSUMMARYTABLE_ARN
    API_KINGSROOM_PLAYERSUMMARYTABLE_NAME
    API_KINGSROOM_PLAYERTABLE_ARN
    API_KINGSROOM_PLAYERTABLE_NAME
    API_KINGSROOM_PLAYERTRANSACTIONTABLE_ARN
    API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME
    API_KINGSROOM_PLAYERVENUETABLE_ARN
    API_KINGSROOM_PLAYERVENUETABLE_NAME
    API_KINGSROOM_VENUEDETAILSTABLE_ARN
    API_KINGSROOM_VENUEDETAILSTABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    API_KINGSROOM_BACKGROUNDTASKTABLE_ARN
    API_KINGSROOM_BACKGROUNDTASKTABLE_NAME
    VENUE_REASSIGNMENT_QUEUE_URL
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * VENUE ASSIGNMENT SERVICE v4 - OPTIMIZED (No Backward Compatibility)
 * ===================================================================
 * 
 * Requires new schema with:
 * - PlayerVenue: entityId (required), visityKey, canonicalVenueId
 * - PlayerEntry/Result/Transaction: entityId
 * - Venue: canonicalVenueId
 * - BackgroundTask model
 * 
 * OPERATIONS:
 * - assignVenueToGame / batchAssignVenues (simple, same entity)
 * - reassignGameVenue / bulkReassignGameVenues (entity-aware)
 * - listGamesNeedingVenue / getVenueAssignmentSummary (queries)
 * - getReassignmentStatus / getVenueClones / findVenueForEntity (queries)
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    GetCommand, 
    UpdateCommand, 
    QueryCommand, 
    PutCommand, 
    DeleteCommand,
    TransactWriteCommand,
    BatchWriteCommand,
    ScanCommand
} = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CONFIGURATION & CACHING
// ===================================================================

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqsClient = new SQSClient({});

// Environment
const QUEUE_URL = process.env.VENUE_REASSIGNMENT_QUEUE_URL;
const ASYNC_THRESHOLD = parseInt(process.env.ASYNC_THRESHOLD_PLAYERS || '50', 10);
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 25;

// Cache table names at module load (Lambda container reuse)
const API_ID = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
const ENV = process.env.ENV;

const TABLES = {
    Game: `Game-${API_ID}-${ENV}`,
    Venue: `Venue-${API_ID}-${ENV}`,
    Player: `Player-${API_ID}-${ENV}`,
    PlayerEntry: `PlayerEntry-${API_ID}-${ENV}`,
    PlayerResult: `PlayerResult-${API_ID}-${ENV}`,
    PlayerTransaction: `PlayerTransaction-${API_ID}-${ENV}`,
    PlayerVenue: `PlayerVenue-${API_ID}-${ENV}`,
    PlayerSummary: `PlayerSummary-${API_ID}-${ENV}`,
    BackgroundTask: `BackgroundTask-${API_ID}-${ENV}`
};

// ===================================================================
// UTILITIES
// ===================================================================

const generateVisitKey = (playerId, entityId, venueId) => `${playerId}#${entityId}#${venueId}`;

const batchArray = (arr, size) => {
    const batches = [];
    for (let i = 0; i < arr.length; i += size) batches.push(arr.slice(i, i + size));
    return batches;
};

const daysBetween = (d1, d2) => Math.floor(Math.abs(new Date(d2) - new Date(d1)) / 86400000);

const calcTargetingClass = (lastPlayed, memberSince) => {
    const days = lastPlayed ? daysBetween(lastPlayed, new Date()) : daysBetween(memberSince || new Date(), new Date());
    if (days <= 30) return 'Active_EL';
    if (days <= 60) return 'Active';
    if (days <= 90) return 'Retain_Inactive31_60d';
    if (days <= 120) return 'Retain_Inactive61_90d';
    if (days <= 180) return 'Churned_91_120d';
    if (days <= 360) return 'Churned_121_180d';
    return 'Churned_181_360d';
};

// ===================================================================
// DATABASE PRIMITIVES
// ===================================================================

const get = async (table, id) => (await ddbDocClient.send(new GetCommand({ TableName: table, Key: { id } }))).Item;

const del = async (table, id) => ddbDocClient.send(new DeleteCommand({ TableName: table, Key: { id } }));

const queryAll = async (table, index, keyName, keyValue, filter = null, filterVals = {}) => {
    const items = [];
    let lastKey = null;
    do {
        const params = {
            TableName: table,
            IndexName: index,
            KeyConditionExpression: `${keyName} = :v`,
            ExpressionAttributeValues: { ':v': keyValue, ...filterVals }
        };
        if (filter) params.FilterExpression = filter;
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const res = await ddbDocClient.send(new QueryCommand(params));
        items.push(...(res.Items || []));
        lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    return items;
};

const batchWrite = async (table, items, transform) => {
    let count = 0;
    for (const batch of batchArray(items, BATCH_SIZE)) {
        await ddbDocClient.send(new BatchWriteCommand({
            RequestItems: { [table]: batch.map(item => ({ PutRequest: { Item: transform(item) } })) }
        }));
        count += batch.length;
    }
    return count;
};

// ===================================================================
// VENUE CLONING
// ===================================================================

async function findVenueForEntity(canonicalVenueId, entityId) {
    const canonical = await get(TABLES.Venue, canonicalVenueId);
    if (canonical?.entityId === entityId) return canonical;
    
    const clones = await queryAll(TABLES.Venue, 'byCanonicalVenue', 'canonicalVenueId', canonicalVenueId, 'entityId = :e', { ':e': entityId });
    return clones[0] || null;
}

async function findOrCreateVenueClone(sourceVenue, targetEntityId) {
    const canonicalId = sourceVenue.canonicalVenueId || sourceVenue.id;
    const existing = await findVenueForEntity(canonicalId, targetEntityId);
    if (existing) return { venueId: existing.id, wasCreated: false };

    // Get next venue number
    const venues = await ddbDocClient.send(new ScanCommand({ TableName: TABLES.Venue, ProjectionExpression: 'venueNumber', Limit: 1000 }));
    const nextNum = (venues.Items || []).reduce((max, v) => Math.max(max, v.venueNumber || 0), 0) + 1;

    const now = new Date().toISOString();
    const cloneId = uuidv4();
    
    await ddbDocClient.send(new PutCommand({
        TableName: TABLES.Venue,
        Item: {
            id: cloneId,
            venueNumber: nextNum,
            name: sourceVenue.name,
            aliases: sourceVenue.aliases || [],
            address: sourceVenue.address,
            city: sourceVenue.city,
            country: sourceVenue.country,
            fee: sourceVenue.fee,
            isSpecial: sourceVenue.isSpecial || false,
            entityId: targetEntityId,
            canonicalVenueId: canonicalId,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'Venue'
        }
    }));

    console.log(`[VA] Created venue clone ${cloneId} for entity ${targetEntityId}`);
    return { venueId: cloneId, wasCreated: true };
}

// ===================================================================
// BACKGROUND TASK
// ===================================================================

async function createTask(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    await ddbDocClient.send(new PutCommand({
        TableName: TABLES.BackgroundTask,
        Item: {
            id, ...data,
            status: 'QUEUED',
            payload: JSON.stringify(data.payload),
            processedCount: 0,
            progressPercent: 0,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'BackgroundTask'
        }
    }));
    return id;
}

async function updateTask(id, status, updates = {}) {
    const now = new Date().toISOString();
    let expr = 'SET #s = :s, updatedAt = :now, #lca = :ts';
    const names = { '#s': 'status', '#lca': '_lastChangedAt' };
    const vals = { ':s': status, ':now': now, ':ts': Date.now() };

    for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) {
            const attr = k === 'result' ? '#r' : k;
            if (k === 'result') names['#r'] = 'result';
            expr += `, ${attr} = :${k}`;
            vals[`:${k}`] = v;
        }
    }

    await ddbDocClient.send(new UpdateCommand({
        TableName: TABLES.BackgroundTask,
        Key: { id },
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals
    }));
}

// ===================================================================
// SQS
// ===================================================================

async function queueJob(data) {
    if (!QUEUE_URL) throw new Error('VENUE_REASSIGNMENT_QUEUE_URL not configured');
    await sqsClient.send(new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(data),
        MessageGroupId: data.gameId,
        MessageDeduplicationId: `${data.taskId || 'x'}-${data.gameId}-${Date.now()}`
    }));
}

// ===================================================================
// GAME UPDATE (TRANSACTIONAL)
// ===================================================================

async function updateGameTransact(gameId, newVenueId, newEntityId, parentGameId) {
    const now = new Date().toISOString();
    const ts = Date.now();

    const items = [{
        Update: {
            TableName: TABLES.Game,
            Key: { id: gameId },
            UpdateExpression: `SET venueId = :v, entityId = :e, venueAssignmentStatus = :s, requiresVenueAssignment = :f, updatedAt = :now, #lca = :ts, #ver = if_not_exists(#ver, :z) + :inc`,
            ExpressionAttributeNames: { '#ver': '_version', '#lca': '_lastChangedAt' },
            ExpressionAttributeValues: { ':v': newVenueId, ':e': newEntityId, ':s': 'MANUALLY_ASSIGNED', ':f': false, ':now': now, ':ts': ts, ':inc': 1, ':z': 0 }
        }
    }];

    if (parentGameId) {
        items.push({
            Update: {
                TableName: TABLES.Game,
                Key: { id: parentGameId },
                UpdateExpression: `SET venueId = :v, entityId = :e, updatedAt = :now, #lca = :ts, #ver = if_not_exists(#ver, :z) + :inc`,
                ExpressionAttributeNames: { '#ver': '_version', '#lca': '_lastChangedAt' },
                ExpressionAttributeValues: { ':v': newVenueId, ':e': newEntityId, ':now': now, ':ts': ts, ':inc': 1, ':z': 0 }
            }
        });
    }

    await ddbDocClient.send(new TransactWriteCommand({ TransactItems: items }));
    return { gameUpdated: true, parentGameUpdated: !!parentGameId };
}

// ===================================================================
// PLAYER RECORD UPDATES
// ===================================================================

async function updatePlayerEntries(gameId, venueId, entityId) {
    const entries = await queryAll(TABLES.PlayerEntry, 'byGame', 'gameId', gameId);
    if (!entries.length) return { count: 0, entries: [] };
    const now = new Date().toISOString();
    const count = await batchWrite(TABLES.PlayerEntry, entries, e => ({ ...e, venueId, entityId, updatedAt: now, _lastChangedAt: Date.now() }));
    return { count, entries };
}

async function updatePlayerResults(gameId, venueId, entityId) {
    const results = await queryAll(TABLES.PlayerResult, 'byGame', 'gameId', gameId);
    if (!results.length) return 0;
    const now = new Date().toISOString();
    return batchWrite(TABLES.PlayerResult, results, r => ({ ...r, venueId, entityId, updatedAt: now, _lastChangedAt: Date.now() }));
}

async function updatePlayerTransactions(gameId, venueId, entityId) {
    const txns = await queryAll(TABLES.PlayerTransaction, 'byGame', 'gameId', gameId);
    if (!txns.length) return 0;
    const now = new Date().toISOString();
    return batchWrite(TABLES.PlayerTransaction, txns, t => ({ ...t, venueId, entityId, updatedAt: now, _lastChangedAt: Date.now() }));
}

// ===================================================================
// PLAYER VENUE PROCESSING
// ===================================================================

async function getPlayerVenue(playerId, entityId, venueId) {
    const visitKey = generateVisitKey(playerId, entityId, venueId);
    const result = await ddbDocClient.send(new QueryCommand({
        TableName: TABLES.PlayerVenue,
        IndexName: 'byVisitKey',
        KeyConditionExpression: 'visityKey = :vk',
        ExpressionAttributeValues: { ':vk': visitKey }
    }));
    return result.Items?.[0];
}

/**
 * Recalculate all PlayerVenue fields from source data (PlayerEntry, PlayerTransaction, PlayerResult)
 * This ensures accuracy after venue reassignments
 */
async function recalculatePlayerVenue(playerId, venueId, entityId, canonicalVenueId) {
    const now = new Date().toISOString();
    const visitKey = generateVisitKey(playerId, entityId, venueId);
    
    // Get all PlayerEntry records for this player at this venue
    const entries = await queryAll(TABLES.PlayerEntry, 'byPlayer', 'playerId', playerId, 'venueId = :vid', { ':vid': venueId });
    
    // If no entries, delete the PlayerVenue record
    if (!entries.length) {
        const existing = await getPlayerVenue(playerId, entityId, venueId);
        if (existing) {
            await del(TABLES.PlayerVenue, existing.id);
            console.log(`[VA] Deleted PlayerVenue for ${playerId} at ${venueId} (no entries)`);
            return { deleted: true };
        }
        return { noChange: true };
    }
    
    // Get all game dates for date calculations
    const gameDates = entries.map(e => e.gameStartDateTime).filter(Boolean).sort();
    const firstPlayedDate = gameDates[0] || now;
    const lastPlayedDate = gameDates[gameDates.length - 1] || now;
    
    // Get all PlayerResult records for winnings calculation
    const gameIds = [...new Set(entries.map(e => e.gameId))];
    let totalWinnings = 0;
    
    for (const gameId of gameIds) {
        const results = await queryAll(TABLES.PlayerResult, 'byGame', 'gameId', gameId, 'playerId = :pid', { ':pid': playerId });
        for (const result of results) {
            totalWinnings += (result.winnings || 0);
        }
    }
    
    // Get all PlayerTransaction records for buy-in calculation
    let totalBuyIns = 0;
    let totalRake = 0;
    
    for (const gameId of gameIds) {
        // Query transactions and filter for BUY_IN type
        const txns = await queryAll(TABLES.PlayerTransaction, 'byGame', 'gameId', gameId, 'playerId = :pid', { ':pid': playerId });
        for (const txn of txns) {
            if (txn.type === 'BUY_IN') {
                totalBuyIns += (txn.amount || 0);
                totalRake += (txn.rake || 0);
            }
        }
    }
    
    // Calculate aggregates
    const totalGamesPlayed = entries.length;
    const averageBuyIn = totalGamesPlayed > 0 ? Math.round((totalBuyIns / totalGamesPlayed) * 100) / 100 : 0;
    const netProfit = totalWinnings - totalBuyIns;
    const targetingClassification = calcTargetingClass(lastPlayedDate, firstPlayedDate);
    
    // Check for existing record
    const existing = await getPlayerVenue(playerId, entityId, venueId);
    
    if (existing) {
        // Update existing record
        await ddbDocClient.send(new UpdateCommand({
            TableName: TABLES.PlayerVenue,
            Key: { id: existing.id },
            UpdateExpression: `SET 
                totalGamesPlayed = :games,
                averageBuyIn = :avgBuyIn,
                totalBuyIns = :totalBuyIns,
                totalWinnings = :totalWinnings,
                netProfit = :netProfit,
                firstPlayedDate = :firstPlayed,
                lastPlayedDate = :lastPlayed,
                targetingClassification = :targeting,
                updatedAt = :now,
                #lca = :ts`,
            ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
            ExpressionAttributeValues: {
                ':games': totalGamesPlayed,
                ':avgBuyIn': averageBuyIn,
                ':totalBuyIns': totalBuyIns,
                ':totalWinnings': totalWinnings,
                ':netProfit': netProfit,
                ':firstPlayed': firstPlayedDate,
                ':lastPlayed': lastPlayedDate,
                ':targeting': targetingClassification,
                ':now': now,
                ':ts': Date.now()
            }
        }));
        
        console.log(`[VA] Recalculated PlayerVenue ${existing.id}: ${totalGamesPlayed} games, $${totalBuyIns} buyins, $${totalWinnings} winnings`);
        return { updated: true, stats: { totalGamesPlayed, totalBuyIns, totalWinnings, netProfit } };
    }
    
    // Create new record
    const newId = uuidv4();
    await ddbDocClient.send(new PutCommand({
        TableName: TABLES.PlayerVenue,
        Item: {
            id: newId,
            playerId,
            venueId,
            entityId,
            visityKey: visitKey,
            canonicalVenueId,
            totalGamesPlayed,
            averageBuyIn,
            totalBuyIns,
            totalWinnings,
            netProfit,
            firstPlayedDate,
            lastPlayedDate,
            membershipCreatedDate: firstPlayedDate,
            targetingClassification,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'PlayerVenue'
        }
    }));
    
    console.log(`[VA] Created PlayerVenue ${newId}: ${totalGamesPlayed} games, $${totalBuyIns} buyins, $${totalWinnings} winnings`);
    return { created: true, stats: { totalGamesPlayed, totalBuyIns, totalWinnings, netProfit } };
}

async function decrementPlayerVenue(playerId, venueId, entityId, canonicalVenueId) {
    // Use full recalculation for accuracy
    const result = await recalculatePlayerVenue(playerId, venueId, entityId, canonicalVenueId || venueId);
    return { 
        decremented: result.updated || result.deleted, 
        deleted: result.deleted || false 
    };
}

async function incrementPlayerVenue(playerId, venueId, entityId, canonicalVenueId, gameBuyIn, gameDate) {
    // Use full recalculation for accuracy
    const result = await recalculatePlayerVenue(playerId, venueId, entityId, canonicalVenueId);
    return { 
        created: result.created || false, 
        updated: result.updated || false 
    };
}

// Keep simplified version for cases where we just need quick check (not used in reassignment)
async function incrementPlayerVenueSimple(playerId, venueId, entityId, canonicalVenueId, gameBuyIn, gameDate) {
    const pv = await getPlayerVenue(playerId, entityId, venueId);
    const now = new Date().toISOString();

    if (pv) {
        const newCount = (pv.totalGamesPlayed || 0) + 1;
        const newTotalBuyIns = (pv.totalBuyIns || 0) + (gameBuyIn || 0);
        const newAvg = Math.round(newTotalBuyIns / newCount * 100) / 100;

        let expr = 'SET totalGamesPlayed = :c, averageBuyIn = :avg, totalBuyIns = :tb, updatedAt = :now, #lca = :ts';
        const names = { '#lca': '_lastChangedAt' };
        const vals = { ':c': newCount, ':avg': newAvg, ':tb': newTotalBuyIns, ':now': now, ':ts': Date.now() };

        const gd = gameDate ? new Date(gameDate) : null;
        if (gd && (!pv.firstPlayedDate || gd < new Date(pv.firstPlayedDate))) {
            expr += ', firstPlayedDate = :fp';
            vals[':fp'] = gameDate;
        }
        if (gd && (!pv.lastPlayedDate || gd > new Date(pv.lastPlayedDate))) {
            expr += ', lastPlayedDate = :lp, targetingClassification = :tc';
            vals[':lp'] = gameDate;
            vals[':tc'] = calcTargetingClass(gameDate, pv.membershipCreatedDate);
        }

        await ddbDocClient.send(new UpdateCommand({
            TableName: TABLES.PlayerVenue,
            Key: { id: pv.id },
            UpdateExpression: expr,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: vals
        }));

        return { created: false, updated: true };
    }

    // Create new
    await ddbDocClient.send(new PutCommand({
        TableName: TABLES.PlayerVenue,
        Item: {
            id: uuidv4(),
            playerId,
            venueId,
            entityId,
            visityKey: generateVisitKey(playerId, entityId, venueId),
            canonicalVenueId,
            totalGamesPlayed: 1,
            averageBuyIn: gameBuyIn || 0,
            totalBuyIns: gameBuyIn || 0,
            totalWinnings: 0,
            netProfit: 0,
            firstPlayedDate: gameDate,
            lastPlayedDate: gameDate,
            membershipCreatedDate: gameDate,
            targetingClassification: calcTargetingClass(gameDate, gameDate),
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'PlayerVenue'
        }
    }));

    return { created: true, updated: false };
}

async function processPlayerVenues(entries, oldVenueId, oldEntityId, newVenueId, newEntityId, gameBuyIn, gameDate) {
    const stats = { oldDecremented: 0, oldDeleted: 0, newCreated: 0, newUpdated: 0, lostOldVenue: [], gainedNewVenue: [] };
    const playerIds = [...new Set(entries.map(e => e.playerId))];

    // Get canonical venue IDs
    const oldVenue = oldVenueId && oldVenueId !== UNASSIGNED_VENUE_ID ? await get(TABLES.Venue, oldVenueId) : null;
    const oldCanonicalId = oldVenue?.canonicalVenueId || oldVenueId;
    
    const newVenue = newVenueId && newVenueId !== UNASSIGNED_VENUE_ID ? await get(TABLES.Venue, newVenueId) : null;
    const newCanonicalId = newVenue?.canonicalVenueId || newVenueId;

    for (const pid of playerIds) {
        // Recalculate old venue (will delete if no entries remain)
        if (oldVenueId && oldVenueId !== UNASSIGNED_VENUE_ID) {
            const r = await decrementPlayerVenue(pid, oldVenueId, oldEntityId, oldCanonicalId);
            if (r.decremented) stats.oldDecremented++;
            if (r.deleted) { stats.oldDeleted++; stats.lostOldVenue.push(pid); }
        }

        // Recalculate new venue (will create if not exists)
        if (newVenueId && newVenueId !== UNASSIGNED_VENUE_ID) {
            const r = await incrementPlayerVenue(pid, newVenueId, newEntityId, newCanonicalId, gameBuyIn, gameDate);
            if (r.created) { stats.newCreated++; stats.gainedNewVenue.push(pid); }
            if (r.updated) stats.newUpdated++;
        }
    }

    return stats;
}

// ===================================================================
// PLAYER SUMMARY & REGISTRATION
// ===================================================================

async function updatePlayerSummaries(lostOldVenue, gainedNewVenue) {
    const now = new Date().toISOString();
    let count = 0;

    for (const pid of lostOldVenue) {
        try {
            await ddbDocClient.send(new UpdateCommand({
                TableName: TABLES.PlayerSummary,
                Key: { id: pid },
                UpdateExpression: 'SET venuesVisited = venuesVisited - :d, updatedAt = :now',
                ConditionExpression: 'venuesVisited > :z',
                ExpressionAttributeValues: { ':d': 1, ':now': now, ':z': 0 }
            }));
            count++;
        } catch (e) { if (e.name !== 'ConditionalCheckFailedException') console.warn(`[VA] Summary decrement failed: ${pid}`); }
    }

    for (const pid of gainedNewVenue) {
        try {
            await ddbDocClient.send(new UpdateCommand({
                TableName: TABLES.PlayerSummary,
                Key: { id: pid },
                UpdateExpression: 'SET venuesVisited = if_not_exists(venuesVisited, :z) + :i, updatedAt = :now',
                ExpressionAttributeValues: { ':i': 1, ':now': now, ':z': 0 }
            }));
            count++;
        } catch (e) { console.warn(`[VA] Summary increment failed: ${pid}`); }
    }

    return count;
}

async function updatePlayerRegistrations(entries, oldVenueId, newVenueId, gameDate) {
    const now = new Date().toISOString();
    let count = 0;

    for (const pid of [...new Set(entries.map(e => e.playerId))]) {
        const player = await get(TABLES.Player, pid);
        if (player?.registrationVenueId === oldVenueId && player?.firstGamePlayed === gameDate) {
            await ddbDocClient.send(new UpdateCommand({
                TableName: TABLES.Player,
                Key: { id: pid },
                UpdateExpression: 'SET registrationVenueId = :v, venueAssignmentStatus = :s, updatedAt = :now',
                ExpressionAttributeValues: { ':v': newVenueId, ':s': 'RETROACTIVE_ASSIGNED', ':now': now }
            }));
            count++;
        }
    }

    return count;
}

// ===================================================================
// CORE REASSIGNMENT LOGIC
// ===================================================================

async function processReassignment({ gameId, oldVenueId, newVenueId, oldEntityId, newEntityId, gameData }) {
    console.log(`[VA] Processing: ${gameId} | Venue: ${oldVenueId} → ${newVenueId} | Entity: ${oldEntityId} → ${newEntityId}`);

    const stats = {
        gameUpdated: false, parentGameUpdated: false,
        playerEntries: 0, playerResults: 0, playerTransactions: 0,
        pvOldDec: 0, pvOldDel: 0, pvNewCreate: 0, pvNewUpdate: 0,
        summaries: 0, registrations: 0
    };

    try {
        // 1. Game (transactional)
        const gameResult = await updateGameTransact(gameId, newVenueId, newEntityId, gameData?.parentGameId);
        Object.assign(stats, gameResult);

        // 2. PlayerEntry
        const { count: entryCount, entries } = await updatePlayerEntries(gameId, newVenueId, newEntityId);
        stats.playerEntries = entryCount;

        if (!entries.length) return { success: true, message: 'No players', stats };

        // 3. PlayerResult
        stats.playerResults = await updatePlayerResults(gameId, newVenueId, newEntityId);

        // 4. PlayerTransaction
        stats.playerTransactions = await updatePlayerTransactions(gameId, newVenueId, newEntityId);

        // 5. PlayerVenue
        const gameBuyIn = (gameData?.buyIn || 0) + (gameData?.rake || 0);
        const pvStats = await processPlayerVenues(entries, oldVenueId, oldEntityId, newVenueId, newEntityId, gameBuyIn, gameData?.gameStartDateTime);
        stats.pvOldDec = pvStats.oldDecremented;
        stats.pvOldDel = pvStats.oldDeleted;
        stats.pvNewCreate = pvStats.newCreated;
        stats.pvNewUpdate = pvStats.newUpdated;

        // 6. PlayerSummary
        stats.summaries = await updatePlayerSummaries(pvStats.lostOldVenue, pvStats.gainedNewVenue);

        // 7. Player registrations
        stats.registrations = await updatePlayerRegistrations(entries, oldVenueId, newVenueId, gameData?.gameStartDateTime);

        console.log(`[VA] ✅ Complete:`, stats);
        return { success: true, message: 'Completed', stats };

    } catch (error) {
        console.error(`[VA] ❌ Error:`, error);
        return { success: false, message: error.message, stats };
    }
}

// ===================================================================
// HANDLERS
// ===================================================================

// --- Entity-Aware Reassignment ---
async function handleReassignGameVenue(input) {
    const { gameId, newVenueId, reassignEntity, initiatedBy } = input;

    const game = await get(TABLES.Game, gameId);
    if (!game) return { success: false, status: 'FAILED', message: 'Game not found' };

    const targetVenue = await get(TABLES.Venue, newVenueId);
    if (!targetVenue) return { success: false, status: 'FAILED', message: 'Venue not found' };

    const { venueId: oldVenueId, entityId: oldEntityId } = game;
    const crossEntity = targetVenue.entityId !== oldEntityId;

    let finalVenueId = newVenueId, finalEntityId = oldEntityId, venueCloned = false, clonedVenueId = null;

    if (crossEntity && !reassignEntity) {
        const clone = await findOrCreateVenueClone(targetVenue, oldEntityId);
        finalVenueId = clone.venueId;
        venueCloned = clone.wasCreated;
        clonedVenueId = clone.wasCreated ? clone.venueId : null;
    } else if (crossEntity) {
        finalEntityId = targetVenue.entityId;
    }

    if (oldVenueId === finalVenueId && oldEntityId === finalEntityId) {
        return { success: true, status: 'NO_CHANGE', message: 'Already assigned' };
    }

    const playerCount = game.totalUniquePlayers || game.totalInitialEntries || 0;
    const gameData = { gameStartDateTime: game.gameStartDateTime, buyIn: game.buyIn, rake: game.rake, parentGameId: game.parentGameId };

    if (playerCount >= ASYNC_THRESHOLD && QUEUE_URL) {
        const taskId = await createTask({
            entityId: oldEntityId,
            taskType: reassignEntity ? 'ENTITY_REASSIGNMENT' : (venueCloned ? 'VENUE_CLONE' : 'VENUE_REASSIGNMENT'),
            targetType: 'Game', targetId: gameId, targetCount: 1,
            payload: { gameId, oldVenueId, newVenueId: finalVenueId, oldEntityId, newEntityId: finalEntityId, gameData },
            initiatedBy: initiatedBy || 'SYSTEM'
        });

        await queueJob({ taskId, gameId, oldVenueId, newVenueId: finalVenueId, oldEntityId, newEntityId: finalEntityId, gameData });

        return { success: true, status: 'QUEUED', message: `${playerCount} players queued`, taskId, gameId, oldVenueId, newVenueId: finalVenueId, oldEntityId, newEntityId: finalEntityId, venueCloned, clonedVenueId };
    }

    const result = await processReassignment({ gameId, oldVenueId, newVenueId: finalVenueId, oldEntityId, newEntityId: finalEntityId, gameData });

    return {
        success: result.success, status: result.success ? 'COMPLETED' : 'FAILED', message: result.message,
        gameId, oldVenueId, newVenueId: finalVenueId, oldEntityId, newEntityId: finalEntityId, venueCloned, clonedVenueId, recordsUpdated: result.stats
    };
}

async function handleBulkReassignGameVenues(input) {
    const { gameIds, newVenueId, entityId, reassignEntity, initiatedBy } = input;

    if (!gameIds?.length) return { success: false, status: 'FAILED', message: 'No games' };

    const targetVenue = await get(TABLES.Venue, newVenueId);
    if (!targetVenue) return { success: false, status: 'FAILED', message: 'Venue not found' };

    const taskId = await createTask({
        entityId,
        taskType: 'BULK_VENUE_REASSIGNMENT',
        targetType: 'Game', targetIds: gameIds, targetCount: gameIds.length,
        payload: { newVenueId, targetVenueEntityId: targetVenue.entityId, reassignEntity },
        initiatedBy: initiatedBy || 'SYSTEM'
    });

    let queued = 0;
    for (const gid of gameIds) {
        const game = await get(TABLES.Game, gid);
        if (!game) continue;

        const crossEntity = targetVenue.entityId !== game.entityId;
        let finalVenueId = newVenueId, finalEntityId = game.entityId;

        if (crossEntity && !reassignEntity) {
            finalVenueId = (await findOrCreateVenueClone(targetVenue, game.entityId)).venueId;
        } else if (crossEntity) {
            finalEntityId = targetVenue.entityId;
        }

        if (game.venueId !== finalVenueId || game.entityId !== finalEntityId) {
            await queueJob({
                taskId, gameId: gid,
                oldVenueId: game.venueId, newVenueId: finalVenueId,
                oldEntityId: game.entityId, newEntityId: finalEntityId,
                gameData: { gameStartDateTime: game.gameStartDateTime, buyIn: game.buyIn, rake: game.rake, parentGameId: game.parentGameId }
            });
            queued++;
        }
    }

    return { success: true, status: 'QUEUED', message: `Queued ${queued} games`, taskId, gameCount: gameIds.length, newVenueId, reassignEntity };
}

// --- Simple Assignment (Original) ---
async function handleAssignVenueToGame(gameId, venueId) {
    const game = await get(TABLES.Game, gameId);
    if (!game) return { success: false, gameId, venueId, error: 'Game not found' };

    if (game.venueId === venueId) return { success: true, gameId, venueId, message: 'Already assigned' };

    const playerCount = await ddbDocClient.send(new QueryCommand({
        TableName: TABLES.PlayerEntry, IndexName: 'byGame',
        KeyConditionExpression: 'gameId = :g', ExpressionAttributeValues: { ':g': gameId }, Select: 'COUNT'
    })).then(r => r.Count || 0);

    const gameData = { gameStartDateTime: game.gameStartDateTime, buyIn: game.buyIn, rake: game.rake, parentGameId: game.parentGameId };

    if (playerCount > ASYNC_THRESHOLD && QUEUE_URL) {
        await queueJob({ gameId, oldVenueId: game.venueId, newVenueId: venueId, oldEntityId: game.entityId, newEntityId: game.entityId, gameData });
        return { success: true, gameId, venueId, queued: true, message: `${playerCount} players queued` };
    }

    const result = await processReassignment({ gameId, oldVenueId: game.venueId, newVenueId: venueId, oldEntityId: game.entityId, newEntityId: game.entityId, gameData });
    return { success: result.success, gameId, venueId, affectedRecords: result.stats, error: result.success ? null : result.message };
}

async function handleBatchAssignVenues(assignments) {
    const results = await Promise.all(assignments.map(a => handleAssignVenueToGame(a.gameId, a.venueId)));
    return { successful: results.filter(r => r.success), failed: results.filter(r => !r.success), totalProcessed: results.length };
}

// --- Queries ---
async function handleListGamesNeedingVenue(limit = 50, nextToken = null, entityId = null) {
    const params = {
        TableName: TABLES.Game, IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :v',
        FilterExpression: entityId ? 'requiresVenueAssignment = :t AND entityId = :e' : 'requiresVenueAssignment = :t',
        ExpressionAttributeValues: { ':v': UNASSIGNED_VENUE_ID, ':t': true, ...(entityId && { ':e': entityId }) },
        Limit: limit
    };
    if (nextToken) params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());

    const res = await ddbDocClient.send(new QueryCommand(params));
    return {
        items: res.Items || [],
        nextToken: res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64') : null,
        totalCount: res.Count || 0
    };
}

async function handleGetVenueAssignmentSummary(entityId = null) {
    const params = {
        TableName: TABLES.Game, IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :v',
        ExpressionAttributeValues: { ':v': UNASSIGNED_VENUE_ID, ...(entityId && { ':e': entityId }) },
        ...(entityId && { FilterExpression: 'entityId = :e' }),
        Select: 'COUNT'
    };
    const res = await ddbDocClient.send(new QueryCommand(params));
    return { totalGames: 0, gamesWithVenue: 0, gamesNeedingVenue: res.Count || 0, pendingAssignments: res.Count || 0 };
}

async function handleGetReassignmentStatus(taskId) {
    const task = await get(TABLES.BackgroundTask, taskId);
    if (!task) return { success: false, message: 'Task not found' };
    return { success: true, task: { id: task.id, status: task.status, taskType: task.taskType, targetCount: task.targetCount, processedCount: task.processedCount, progressPercent: task.progressPercent, result: task.result, errorMessage: task.errorMessage, createdAt: task.createdAt, startedAt: task.startedAt, completedAt: task.completedAt } };
}

async function handleGetVenueClones(canonicalVenueId) {
    return queryAll(TABLES.Venue, 'byCanonicalVenue', 'canonicalVenueId', canonicalVenueId);
}

// --- SQS ---
async function handleSQS(event) {
    const results = [];
    for (const record of event.Records) {
        try {
            const body = JSON.parse(record.body);
            if (body.taskId) await updateTask(body.taskId, 'PROCESSING', { startedAt: new Date().toISOString() });

            const result = await processReassignment(body);

            if (body.taskId) {
                await updateTask(body.taskId, result.success ? 'COMPLETED' : 'FAILED', {
                    completedAt: new Date().toISOString(),
                    processedCount: 1, progressPercent: 100,
                    ...(result.success ? { result: JSON.stringify(result) } : { errorMessage: result.message })
                });
            }
            results.push({ messageId: record.messageId, success: true });
        } catch (e) {
            console.error(`[VA:SQS] Error:`, e);
            results.push({ messageId: record.messageId, success: false });
        }
    }
    return { batchItemFailures: results.filter(r => !r.success).map(r => ({ itemIdentifier: r.messageId })) };
}

// ===================================================================
// LAMBDA HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[VA] v4 Event:', JSON.stringify(event, null, 2));

    if (event.Records) return handleSQS(event);

    const field = event.fieldName;
    const args = event.arguments || {};

    switch (field || event.operation) {
        case 'reassignGameVenue': return handleReassignGameVenue(args.input || args);
        case 'bulkReassignGameVenues': return handleBulkReassignGameVenues(args.input || args);
        case 'assignVenueToGame': return handleAssignVenueToGame(args.gameId, args.venueId);
        case 'batchAssignVenues': return handleBatchAssignVenues(args.assignments);
        case 'listGamesNeedingVenue': return handleListGamesNeedingVenue(args.limit, args.nextToken, args.entityId);
        case 'getVenueAssignmentSummary': return handleGetVenueAssignmentSummary(args.entityId);
        case 'getReassignmentStatus': return handleGetReassignmentStatus(args.taskId || args.id);
        case 'getVenueClones': return handleGetVenueClones(args.canonicalVenueId);
        case 'findVenueForEntity': return findVenueForEntity(args.canonicalVenueId, args.entityId);
        case 'assignVenue': return handleAssignVenueToGame(event.gameId, event.venueId);
        case 'batchAssign': return handleBatchAssignVenues(event.assignments);
        case 'reassign': return handleReassignGameVenue(event);
        case 'bulkReassign': return handleBulkReassignGameVenues(event);
        case 'getGamesNeedingVenue': return handleListGamesNeedingVenue(event.limit, event.nextToken, event.entityId);
        case 'getSummary': return handleGetVenueAssignmentSummary(event.entityId);
        default: throw new Error(`Unknown: ${field || event.operation}`);
    }
};

module.exports.processReassignment = processReassignment;
module.exports.generateVisitKey = generateVisitKey;