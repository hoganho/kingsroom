/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_PLAYERENTRYTABLE_ARN
	API_KINGSROOM_PLAYERENTRYTABLE_NAME
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * SAVEGAME LAMBDA FUNCTION
 * 
 * Single interface for saving game data from any source:
 * - Web scraping
 * - API integrations
 * - Manual entry
 * - Bulk imports
 * 
 * Responsibilities:
 * 1. Validate input
 * 2. Resolve venue
 * 3. Save/update game in DynamoDB
 * 4. Track scrape attempts
 * 5. Determine if game is finished
 * 6. Queue for PDP only if finished with results
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');

// Constants
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";

// Game status classifications
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];
const LIVE_STATUSES = ['RUNNING', 'REGISTERING', 'CLOCK_STOPPED'];
const SCHEDULED_STATUSES = ['SCHEDULED', 'INITIATING'];
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_IN_USE', 'NOT_PUBLISHED'];

// Initialize clients
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

// --- Lambda Monitoring Initialization ---
const monitoring = new LambdaMonitoring('saveGameFunction', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// Environment variables
const PLAYER_PROCESSOR_QUEUE_URL = process.env.PLAYER_PROCESSOR_QUEUE_URL;

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Generate table name from model name
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error('API ID or environment name not found in environment variables.');
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Ensure date is in ISO format
 */
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) return fallback || new Date().toISOString();
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) return dateValue;
        } catch (e) {}
    }
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return `${dateValue}T00:00:00.000Z`;
    }
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {
        console.error(`Failed to parse date: ${dateValue}`, error);
    }
    return fallback || new Date().toISOString();
};

// ===================================================================
// VALIDATION
// ===================================================================

/**
 * Validate SaveGameInput
 */
const validateInput = (input) => {
    const warnings = [];
    const errors = [];
    
    // === Required Fields ===
    if (!input.source) {
        errors.push('source is required');
    } else {
        if (!input.source.type) errors.push('source.type is required');
        if (!input.source.sourceId) errors.push('source.sourceId is required');
        if (!input.source.entityId) errors.push('source.entityId is required');
    }
    
    if (!input.game) {
        errors.push('game is required');
    } else {
        if (!input.game.name) errors.push('game.name is required');
        if (!input.game.gameType) errors.push('game.gameType is required');
        if (!input.game.gameStatus) errors.push('game.gameStatus is required');
        if (!input.game.gameStartDateTime) errors.push('game.gameStartDateTime is required');
    }
    
    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }
    
    // === Warnings for Recommended Fields ===
    if (!input.game.buyIn && input.game.buyIn !== 0) {
        warnings.push('No buyIn specified');
    }
    if (!input.game.gameVariant) {
        warnings.push('No gameVariant specified, defaulting to NLHE');
    }
    if (!input.venue) {
        warnings.push('No venue information provided');
    }
    
    // === Validate Player Data (if provided) ===
    if (input.players) {
        if (!input.players.allPlayers || !Array.isArray(input.players.allPlayers)) {
            errors.push('players.allPlayers must be an array');
        } else {
            for (let i = 0; i < input.players.allPlayers.length; i++) {
                const player = input.players.allPlayers[i];
                if (!player.name) {
                    errors.push(`players.allPlayers[${i}].name is required`);
                }
            }
        }
    }
    
    // === Validate Game Status ===
    const validStatuses = [...FINISHED_STATUSES, ...LIVE_STATUSES, ...SCHEDULED_STATUSES, ...INACTIVE_STATUSES, 'UNKNOWN'];
    if (input.game.gameStatus && !validStatuses.includes(input.game.gameStatus)) {
        warnings.push(`Unknown gameStatus: ${input.game.gameStatus}`);
    }
    
    return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
    };
};

// ===================================================================
// VENUE RESOLUTION
// ===================================================================

/**
 * Resolve venue from input
 */
const resolveVenue = async (venueRef, entityId) => {
    // No venue reference provided
    if (!venueRef) {
        return {
            venueId: UNASSIGNED_VENUE_ID,
            venueName: UNASSIGNED_VENUE_NAME,
            status: 'UNASSIGNED',
            confidence: 0
        };
    }
    
    // Explicit venueId provided - use it directly
    if (venueRef.venueId) {
        const venue = await getVenueById(venueRef.venueId);
        return {
            venueId: venueRef.venueId,
            venueName: venue?.name || venueRef.venueName || 'Unknown',
            status: 'MANUALLY_ASSIGNED',
            confidence: 1.0
        };
    }
    
    // Suggested venue from auto-detection
    if (venueRef.suggestedVenueId) {
        const venue = await getVenueById(venueRef.suggestedVenueId);
        return {
            venueId: venueRef.suggestedVenueId,
            venueName: venue?.name || venueRef.venueName,
            status: 'AUTO_ASSIGNED',
            confidence: venueRef.confidence || 0.8
        };
    }
    
    // Try to match by name
    if (venueRef.venueName) {
        const matched = await matchVenueByName(venueRef.venueName, entityId);
        if (matched) {
            return {
                venueId: matched.id,
                venueName: matched.name,
                status: 'AUTO_ASSIGNED',
                confidence: matched.confidence
            };
        }
        
        // No match found - assign to unassigned but track suggested name
        return {
            venueId: UNASSIGNED_VENUE_ID,
            venueName: UNASSIGNED_VENUE_NAME,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            suggestedName: venueRef.venueName
        };
    }
    
    // Fallback to unassigned
    return {
        venueId: UNASSIGNED_VENUE_ID,
        venueName: UNASSIGNED_VENUE_NAME,
        status: 'UNASSIGNED',
        confidence: 0
    };
};

/**
 * Get venue by ID
 */
const getVenueById = async (venueId) => {
    try {
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: getTableName('Venue'),
            Key: { id: venueId }
        }));
        return result.Item;
    } catch (error) {
        console.error(`[VENUE] Error fetching venue ${venueId}:`, error);
        return null;
    }
};

/**
 * Match venue by name using aliases
 */
const matchVenueByName = async (venueName, entityId) => {
    if (!venueName) return null;
    
    const normalizedInput = venueName.toLowerCase().trim();
    
    try {
        // Query venues for this entity
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: getTableName('Venue'),
            IndexName: 'byEntityVenue',
            KeyConditionExpression: 'entityId = :entityId',
            ExpressionAttributeValues: {
                ':entityId': entityId
            }
        }));
        
        const venues = result.Items || [];
        
        for (const venue of venues) {
            // Check exact name match
            if (venue.name.toLowerCase().trim() === normalizedInput) {
                return { id: venue.id, name: venue.name, confidence: 1.0 };
            }
            
            // Check aliases
            if (venue.aliases && Array.isArray(venue.aliases)) {
                for (const alias of venue.aliases) {
                    if (alias.toLowerCase().trim() === normalizedInput) {
                        return { id: venue.id, name: venue.name, confidence: 0.95 };
                    }
                }
            }
            
            // Check partial match (contains)
            if (venue.name.toLowerCase().includes(normalizedInput) || 
                normalizedInput.includes(venue.name.toLowerCase())) {
                return { id: venue.id, name: venue.name, confidence: 0.7 };
            }
        }
        
        return null;
    } catch (error) {
        console.error(`[VENUE] Error matching venue by name:`, error);
        return null;
    }
};

// ===================================================================
// GAME OPERATIONS
// ===================================================================

/**
 * Find existing game by various criteria
 */
const findExistingGame = async (input) => {
    const gameTable = getTableName('Game');
    
    monitoring.trackOperation('FIND_EXISTING', 'Game', input.game.tournamentId?.toString() || 'unknown');
    
    // 1. Check by explicit existingGameId
    if (input.game.existingGameId) {
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: input.game.existingGameId }
        }));
        if (result.Item) return result.Item;
    }
    
    // 2. Check by sourceUrl (for scrape sources)
    if (input.source.type === 'SCRAPE' && input.source.sourceId) {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'bySourceUrl',
            KeyConditionExpression: 'sourceUrl = :url',
            ExpressionAttributeValues: {
                ':url': input.source.sourceId
            }
        }));
        if (result.Items && result.Items.length > 0) {
            return result.Items[0];
        }
    }
    
    // 3. Check by tournamentId + entityId
    if (input.game.tournamentId && input.source.entityId) {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byEntityAndTournamentId',
            KeyConditionExpression: 'entityId = :entityId AND tournamentId = :tournamentId',
            ExpressionAttributeValues: {
                ':entityId': input.source.entityId,
                ':tournamentId': input.game.tournamentId
            }
        }));
        if (result.Items && result.Items.length > 0) {
            return result.Items[0];
        }
    }
    
    return null;
};

/**
 * Create new game in DynamoDB
 */
const createGame = async (input, venueResolution) => {
    const gameId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    monitoring.trackOperation('CREATE', 'Game', gameId, { 
        entityId: input.source.entityId,
        tournamentId: input.game.tournamentId 
    });
    
    const game = {
        id: gameId,
        
        // Core identification
        name: input.game.name,
        gameType: input.game.gameType,
        gameVariant: input.game.gameVariant || 'NLHE',
        gameStatus: input.game.gameStatus,
        
        // Scheduling
        gameStartDateTime: ensureISODate(input.game.gameStartDateTime),
        gameEndDateTime: input.game.gameEndDateTime ? ensureISODate(input.game.gameEndDateTime) : null,
        registrationStatus: input.game.registrationStatus || 'N_A',
        gameFrequency: input.game.gameFrequency || 'UNKNOWN',
        
        // Financials
        buyIn: input.game.buyIn || 0,
        rake: input.game.rake || 0,
        hasGuarantee: input.game.hasGuarantee || false,
        guaranteeAmount: input.game.guaranteeAmount || 0,
        startingStack: input.game.startingStack || 0,
        
        // Results
        prizepool: input.game.prizepool || 0,
        totalEntries: input.game.totalEntries || 0,
        totalRebuys: input.game.totalRebuys || 0,
        totalAddons: input.game.totalAddons || 0,
        
        // Categorization
        tournamentType: input.game.tournamentType,
        isSeries: input.game.isSeries || false,
        seriesName: input.game.seriesName,
        isSatellite: input.game.isSatellite || false,
        gameTags: input.game.gameTags || [],
        
        // Source tracking
        sourceUrl: input.source.type === 'SCRAPE' ? input.source.sourceId : null,
        tournamentId: input.game.tournamentId,
        
        // Venue assignment
        venueId: venueResolution.venueId,
        venueAssignmentStatus: venueResolution.status,
        suggestedVenueName: venueResolution.suggestedName || null,
        venueAssignmentConfidence: venueResolution.confidence,
        requiresVenueAssignment: venueResolution.venueId === UNASSIGNED_VENUE_ID,
        
        // Entity
        entityId: input.source.entityId,
        
        // Timestamps
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'Game'
    };
    
    await monitoredDdbDocClient.send(new PutCommand({
        TableName: getTableName('Game'),
        Item: game
    }));
    
    console.log(`[SAVE-GAME] Created new game: ${gameId}`);
    return { gameId, game, wasNewGame: true, fieldsUpdated: [] };
};

/**
 * Update existing game in DynamoDB
 */
const updateGame = async (existingGame, input, venueResolution) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const fieldsUpdated = [];
    
    monitoring.trackOperation('UPDATE', 'Game', existingGame.id, { 
        entityId: input.source.entityId,
        tournamentId: input.game.tournamentId 
    });
    
    // Build update expression dynamically
    const updateFields = {};
    
    // Only update fields that have changed or have values
    const checkAndUpdate = (field, newValue, existingValue) => {
        if (newValue !== undefined && newValue !== existingValue) {
            updateFields[field] = newValue;
            fieldsUpdated.push(field);
        }
    };
    
    // Core fields
    checkAndUpdate('name', input.game.name, existingGame.name);
    checkAndUpdate('gameStatus', input.game.gameStatus, existingGame.gameStatus);
    checkAndUpdate('registrationStatus', input.game.registrationStatus, existingGame.registrationStatus);
    
    // Financials
    checkAndUpdate('buyIn', input.game.buyIn, existingGame.buyIn);
    checkAndUpdate('rake', input.game.rake, existingGame.rake);
    checkAndUpdate('hasGuarantee', input.game.hasGuarantee, existingGame.hasGuarantee);
    checkAndUpdate('guaranteeAmount', input.game.guaranteeAmount, existingGame.guaranteeAmount);
    checkAndUpdate('startingStack', input.game.startingStack, existingGame.startingStack);
    
    // Results
    checkAndUpdate('prizepool', input.game.prizepool, existingGame.prizepool);
    checkAndUpdate('totalEntries', input.game.totalEntries, existingGame.totalEntries);
    checkAndUpdate('totalRebuys', input.game.totalRebuys, existingGame.totalRebuys);
    checkAndUpdate('totalAddons', input.game.totalAddons, existingGame.totalAddons);
    
    // Dates
    if (input.game.gameEndDateTime) {
        checkAndUpdate('gameEndDateTime', ensureISODate(input.game.gameEndDateTime), existingGame.gameEndDateTime);
    }
    
    // Venue (only update if better confidence or explicit assignment)
    if (venueResolution.confidence > (existingGame.venueAssignmentConfidence || 0) ||
        venueResolution.status === 'MANUALLY_ASSIGNED') {
        checkAndUpdate('venueId', venueResolution.venueId, existingGame.venueId);
        checkAndUpdate('venueAssignmentStatus', venueResolution.status, existingGame.venueAssignmentStatus);
        checkAndUpdate('venueAssignmentConfidence', venueResolution.confidence, existingGame.venueAssignmentConfidence);
        checkAndUpdate('requiresVenueAssignment', venueResolution.venueId === UNASSIGNED_VENUE_ID, existingGame.requiresVenueAssignment);
    }
    
    // Always update timestamps
    updateFields.updatedAt = now;
    updateFields._lastChangedAt = timestamp;
    
    if (Object.keys(updateFields).length > 2) { // More than just timestamps
        // Build update expression
        const updateExpression = 'SET ' + Object.keys(updateFields)
            .map(key => `#${key} = :${key}`)
            .join(', ');
        
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        Object.keys(updateFields).forEach(key => {
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = updateFields[key];
        });
        
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: getTableName('Game'),
            Key: { id: existingGame.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[SAVE-GAME] Updated game ${existingGame.id}, fields: ${fieldsUpdated.join(', ')}`);
    } else {
        console.log(`[SAVE-GAME] No changes detected for game ${existingGame.id}`);
    }
    
    // Return merged game object
    const updatedGame = { ...existingGame, ...updateFields };
    return { gameId: existingGame.id, game: updatedGame, wasNewGame: false, fieldsUpdated };
};

// ===================================================================
// SCRAPE TRACKING
// ===================================================================

/**
 * Update ScrapeURL tracking (for scrape sources)
 */
const updateScrapeURL = async (sourceUrl, gameId, gameStatus, doNotScrape = false) => {
    if (!sourceUrl) return;
    
    const now = new Date().toISOString();
    
    monitoring.trackOperation('UPDATE', 'ScrapeURL', sourceUrl);
    
    try {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: getTableName('ScrapeURL'),
            Key: { id: sourceUrl },
            UpdateExpression: `
                SET gameId = :gameId,
                    gameStatus = :gameStatus,
                    lastScrapeStatus = :status,
                    lastScrapedAt = :now,
                    doNotScrape = :dns,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':gameId': gameId,
                ':gameStatus': gameStatus,
                ':status': doNotScrape ? 'SKIPPED_DONOTSCRAPE' : 'SUCCESS',
                ':now': now,
                ':dns': doNotScrape
            }
        }));
        
        console.log(`[SAVE-GAME] Updated ScrapeURL: ${sourceUrl}`);
    } catch (error) {
        console.error(`[SAVE-GAME] Error updating ScrapeURL:`, error);
    }
};

/**
 * Create ScrapeAttempt record
 */
const createScrapeAttempt = async (input, gameId, wasNewGame, fieldsUpdated) => {
    const attemptId = uuidv4();
    const now = new Date().toISOString();
    
    monitoring.trackOperation('INSERT', 'ScrapeAttempt', attemptId);
    
    // Determine status
    let status = 'SUCCESS';
    if (wasNewGame) status = 'SAVED';
    else if (fieldsUpdated.length > 0) status = 'UPDATED';
    else status = 'NO_CHANGES';
    
    const attempt = {
        id: attemptId,
        url: input.source.sourceId,
        scrapedAt: input.source.fetchedAt || now,
        status: status,
        gameStatus: input.game.gameStatus,
        fieldsExtracted: Object.keys(input.game).filter(k => input.game[k] !== null && input.game[k] !== undefined),
        fieldsUpdated: fieldsUpdated,
        wasNewGame: wasNewGame,
        gameId: gameId,
        entityId: input.source.entityId,
        contentHash: input.source.contentHash,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'ScrapeAttempt'
    };
    
    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: getTableName('ScrapeAttempt'),
            Item: attempt
        }));
        console.log(`[SAVE-GAME] Created ScrapeAttempt: ${attemptId}`);
    } catch (error) {
        console.error(`[SAVE-GAME] Error creating ScrapeAttempt:`, error);
    }
    
    return attemptId;
};

// ===================================================================
// PLAYER PROCESSING QUEUE
// ===================================================================

/**
 * Determine if game should be queued for player processing
 */
const shouldQueueForPDP = (input, game) => {
    // Must have queue URL configured
    if (!PLAYER_PROCESSOR_QUEUE_URL) {
        console.log('[SAVE-GAME] PDP queue not configured, skipping');
        return { shouldQueue: false, reason: 'QUEUE_NOT_CONFIGURED' };
    }
    
    // Must have player data
    if (!input.players || !input.players.allPlayers || input.players.allPlayers.length === 0) {
        console.log('[SAVE-GAME] No player data, skipping PDP');
        return { shouldQueue: false, reason: 'NO_PLAYER_DATA' };
    }
    
    // Skip if explicitly requested
    if (input.options?.skipPlayerProcessing) {
        console.log('[SAVE-GAME] skipPlayerProcessing flag set, skipping PDP');
        return { shouldQueue: false, reason: 'EXPLICITLY_SKIPPED' };
    }
    
    // Check game status - only process FINISHED games
    const gameStatus = game.gameStatus || input.game.gameStatus;
    
    if (FINISHED_STATUSES.includes(gameStatus)) {
        // Game is finished - check if we have complete results
        if (input.players.hasCompleteResults || input.players.allPlayers.some(p => p.rank)) {
            console.log(`[SAVE-GAME] Game is FINISHED with results, queueing for PDP`);
            return { shouldQueue: true, reason: 'FINISHED_WITH_RESULTS' };
        } else {
            console.log(`[SAVE-GAME] Game is FINISHED but no complete results`);
            return { shouldQueue: false, reason: 'FINISHED_NO_RESULTS' };
        }
    }
    
    if (LIVE_STATUSES.includes(gameStatus)) {
        console.log(`[SAVE-GAME] Game is LIVE (${gameStatus}), will update entries only`);
        return { shouldQueue: false, reason: 'LIVE_GAME', updateEntriesOnly: true };
    }
    
    if (SCHEDULED_STATUSES.includes(gameStatus)) {
        console.log(`[SAVE-GAME] Game is SCHEDULED (${gameStatus}), no player processing needed`);
        return { shouldQueue: false, reason: 'SCHEDULED_GAME' };
    }
    
    if (INACTIVE_STATUSES.includes(gameStatus)) {
        console.log(`[SAVE-GAME] Game is INACTIVE (${gameStatus}), no player processing needed`);
        return { shouldQueue: false, reason: 'INACTIVE_GAME' };
    }
    
    // Unknown status - don't process
    console.log(`[SAVE-GAME] Unknown game status (${gameStatus}), skipping PDP`);
    return { shouldQueue: false, reason: 'UNKNOWN_STATUS' };
};

/**
 * Queue game for Player Data Processor
 */
const queueForPDP = async (game, input) => {
    monitoring.trackOperation('QUEUE_PDP', 'SQS', game.id);
    
    const message = {
        game: {
            id: game.id,
            name: game.name,
            gameType: game.gameType,
            gameVariant: game.gameVariant,
            gameStatus: game.gameStatus,
            gameStartDateTime: game.gameStartDateTime,
            gameEndDateTime: game.gameEndDateTime,
            buyIn: game.buyIn,
            rake: game.rake,
            prizepool: game.prizepool,
            totalEntries: game.totalEntries,
            totalRebuys: game.totalRebuys,
            totalAddons: game.totalAddons,
            venueId: game.venueId,
            entityId: game.entityId,
            isSeries: game.isSeries,
            seriesName: game.seriesName,
            isSatellite: game.isSatellite,
            gameFrequency: game.gameFrequency
        },
        players: input.players,
        metadata: {
            processedAt: new Date().toISOString(),
            sourceUrl: input.source.sourceId,
            venueId: game.venueId,
            entityId: game.entityId,
            hasCompleteResults: input.players.hasCompleteResults,
            totalPlayersProcessed: input.players.allPlayers.length,
            totalPrizesPaid: input.players.totalPrizesPaid || 0
        }
    };
    
    try {
        await sqsClient.send(new SendMessageCommand({
            QueueUrl: PLAYER_PROCESSOR_QUEUE_URL,
            MessageBody: JSON.stringify(message),
            MessageGroupId: String(input.game.tournamentId || game.id),
            MessageDeduplicationId: `${game.id}-${Date.now()}`
        }));
        
        console.log(`[SAVE-GAME] Queued game ${game.id} for PDP (${input.players.allPlayers.length} players)`);
        return true;
    } catch (error) {
        console.error(`[SAVE-GAME] Error queueing for PDP:`, error);
        throw error;
    }
};

/**
 * Update player entries for live games (without full PDP processing)
 */
const updatePlayerEntries = async (game, input) => {
    if (!input.players || !input.players.allPlayers) return;
    
    const playerEntryTable = getTableName('PlayerEntry');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    monitoring.trackOperation('BATCH_WRITE', 'PlayerEntry', game.id, { 
        count: input.players.allPlayers.length 
    });
    
    console.log(`[SAVE-GAME] Updating ${input.players.allPlayers.length} player entries for live game`);
    
    const entries = input.players.allPlayers.map(player => {
        // Generate consistent player ID from name
        const crypto = require('crypto');
        const normalized = player.name.toLowerCase().trim();
        const playerId = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
        const entryId = `${playerId}#${game.id}`;
        
        return {
            PutRequest: {
                Item: {
                    id: entryId,
                    playerId: playerId,
                    gameId: game.id,
                    venueId: game.venueId,
                    status: 'PLAYING',
                    registrationTime: now,
                    gameStartDateTime: game.gameStartDateTime,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerEntry'
                }
            }
        };
    });
    
    // Batch write in chunks of 25
    const chunks = [];
    for (let i = 0; i < entries.length; i += 25) {
        chunks.push(entries.slice(i, i + 25));
    }
    
    for (const chunk of chunks) {
        try {
            await monitoredDdbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [playerEntryTable]: chunk
                }
            }));
        } catch (error) {
            console.error(`[SAVE-GAME] Error batch writing entries:`, error);
        }
    }
    
    console.log(`[SAVE-GAME] Updated player entries for live game ${game.id}`);
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[SAVE-GAME] Lambda invoked');
    console.log('[SAVE-GAME] Event:', JSON.stringify(event, null, 2));
    
    // Extract input from various event formats
    const input = event.arguments?.input || event.input || event;
    
    // Update monitoring entity ID
    if (input.source?.entityId) {
        monitoring.entityId = input.source.entityId;
    }
    
    monitoring.trackOperation('HANDLER_START', 'Handler', 'saveGame', { 
        entityId: input.source?.entityId 
    });
    
    try {
        // === 1. VALIDATE INPUT ===
        const validation = validateInput(input);
        
        if (!validation.valid) {
            console.error('[SAVE-GAME] Validation failed:', validation.errors);
            return {
                success: false,
                action: 'VALIDATION_FAILED',
                message: validation.errors.join('; '),
                warnings: validation.warnings
            };
        }
        
        // === 2. VALIDATE ONLY MODE ===
        if (input.options?.validateOnly) {
            return {
                success: true,
                action: 'VALIDATED',
                message: 'Input validation passed',
                warnings: validation.warnings
            };
        }
        
        // === 3. RESOLVE VENUE ===
        const venueResolution = await resolveVenue(input.venue, input.source.entityId);
        console.log(`[SAVE-GAME] Venue resolved:`, venueResolution);
        
        // === 4. FIND EXISTING GAME ===
        const existingGame = await findExistingGame(input);
        
        // === 5. CREATE OR UPDATE GAME ===
        let saveResult;
        
        if (existingGame && !input.options?.forceUpdate) {
            // Check if we should skip or update
            const hasChanges = input.game.gameStatus !== existingGame.gameStatus ||
                               input.game.totalEntries !== existingGame.totalEntries ||
                               input.game.prizepool !== existingGame.prizepool;
            
            if (!hasChanges) {
                console.log(`[SAVE-GAME] Game exists with no changes, skipping`);
                saveResult = {
                    gameId: existingGame.id,
                    game: existingGame,
                    wasNewGame: false,
                    fieldsUpdated: []
                };
            } else {
                saveResult = await updateGame(existingGame, input, venueResolution);
            }
        } else if (existingGame && input.options?.forceUpdate) {
            saveResult = await updateGame(existingGame, input, venueResolution);
        } else {
            saveResult = await createGame(input, venueResolution);
        }
        
        const { gameId, game, wasNewGame, fieldsUpdated } = saveResult;
        
        // === 6. TRACK SCRAPE (for scrape sources) ===
        if (input.source.type === 'SCRAPE') {
            await updateScrapeURL(
                input.source.sourceId, 
                gameId, 
                game.gameStatus,
                input.options?.doNotScrape
            );
            await createScrapeAttempt(input, gameId, wasNewGame, fieldsUpdated);
        }
        
        // === 7. DETERMINE IF FINISHED AND QUEUE FOR PDP ===
        const pdpDecision = shouldQueueForPDP(input, game);
        let playerProcessingQueued = false;
        
        if (pdpDecision.shouldQueue) {
            await queueForPDP(game, input);
            playerProcessingQueued = true;
        } else if (pdpDecision.updateEntriesOnly) {
            // Live game - just update entries
            await updatePlayerEntries(game, input);
        }
        
        // === 8. RETURN RESULT ===
        const action = wasNewGame ? 'CREATED' : 
                       fieldsUpdated.length > 0 ? 'UPDATED' : 'SKIPPED';
        
        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', action, { 
            gameId, 
            entityId: input.source.entityId 
        });
        
        return {
            success: true,
            gameId: gameId,
            action: action,
            message: `Game ${action.toLowerCase()} successfully`,
            warnings: validation.warnings,
            playerProcessingQueued: playerProcessingQueued,
            playerProcessingReason: pdpDecision.reason,
            venueAssignment: {
                venueId: venueResolution.venueId,
                venueName: venueResolution.venueName,
                status: venueResolution.status,
                confidence: venueResolution.confidence
            },
            fieldsUpdated: fieldsUpdated
        };
        
    } catch (error) {
        console.error('[SAVE-GAME] Error:', error);
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'error', { 
            error: error.message 
        });
        return {
            success: false,
            action: 'ERROR',
            message: error.message || 'Internal error'
        };
    } finally {
        // Flush monitoring metrics
        if (monitoring) {
            console.log('[SAVE-GAME] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[SAVE-GAME] Monitoring flush complete.');
        }
    }
};