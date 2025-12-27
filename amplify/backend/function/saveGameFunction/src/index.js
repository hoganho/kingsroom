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
	API_KINGSROOM_TOURNAMENTSERIESTABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
    API_KINGSROOM_RECURRINGGAMETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * SAVEGAME LAMBDA FUNCTION - PURE WRITER (v4.1.0)
 * ===================================================================
 * 
 * VERSION: 4.1.0 (Added classification fields support)
 * 
 * RESPONSIBILITIES:
 * This Lambda is now a "pure writer" that accepts pre-enriched data
 * from gameDataEnricher and writes it to the database. All enrichment
 * logic (series resolution, recurring resolution, query keys, financials)
 * has been moved to gameDataEnricher.
 * 
 * WHAT THIS LAMBDA DOES:
 * - Validates input structure (not business rules)
 * - Creates or updates Game records in DynamoDB
 * - Updates ScrapeURL tracking
 * - Creates ScrapeAttempt records
 * - Queues player data for processing (SQS)
 * 
 * NOTE: GameCost and GameFinancialSnapshot are now created by
 * gameFinancialsProcessor Lambda (triggered via DynamoDB Streams)
 * 
 * WHAT THIS LAMBDA DOES NOT DO:
 * - Series resolution (done by gameDataEnricher)
 * - Recurring game resolution (done by gameDataEnricher)
 * - Query key computation (done by gameDataEnricher)
 * - Financial calculations (done by gameDataEnricher)
 * - Venue resolution (done by gameDataEnricher)
 * 
 * ENTITY ID REQUIREMENT:
 * This Lambda REQUIRES source.entityId to be provided in the input.
 * 
 * CHANGELOG:
 * v4.1.0 - Added 29 classification fields to createGame() and updateGame()
 *        - Uses entryStructure (not tournamentStructure) to avoid @model conflict
 *        - Uses cashRakeType (not rakeStructure) to avoid @model conflict
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// Lambda Monitoring
const { LambdaMonitoring } = require('./lambda-monitoring');

// ===================================================================
// CONSTANTS
// ===================================================================

const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";

// Game status classifications
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];
const LIVE_STATUSES = ['RUNNING', 'REGISTERING', 'CLOCK_STOPPED'];
const SCHEDULED_STATUSES = ['SCHEDULED', 'INITIATING'];
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_IN_USE', 'NOT_PUBLISHED'];

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

// Lambda Monitoring Initialization
const monitoring = new LambdaMonitoring('saveGameFunction', 'pending-entity');
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// Environment variables
const PLAYER_PROCESSOR_QUEUE_URL = process.env.PLAYER_PROCESSOR_QUEUE_URL;

// DEBUG: Log SQS configuration at cold start
console.log('[SAVE-GAME] [SQS-DEBUG] Lambda cold start - SQS Config:', {
    PLAYER_PROCESSOR_QUEUE_URL_SET: !!PLAYER_PROCESSOR_QUEUE_URL,
    PLAYER_PROCESSOR_QUEUE_URL_VALUE: PLAYER_PROCESSOR_QUEUE_URL ? `${PLAYER_PROCESSOR_QUEUE_URL.substring(0, 50)}...` : 'NOT SET'
});

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

/**
 * Extract YYYY-MM from ISO date string for byGameMonth GSI
 * @param {string} isoDateString - ISO format date string
 * @returns {string|null} Format: "2025-08" or null
 */
const getYearMonth = (isoDateString) => {
  if (!isoDateString) return null;
  const date = new Date(isoDateString);
  if (isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const parseAuditTrail = (auditTrailString) => {
    if (!auditTrailString) return null;
    try {
        const parsed = JSON.parse(auditTrailString);
        return {
            editedAt: parsed.editedAt,
            editedBy: parsed.editedBy,
            changedFields: parsed.changedFields || [],
            changes: parsed.changes || {},
            validationWarnings: parsed.validationWarnings || [],
            originalData: parsed.originalData
        };
    } catch (error) {
        console.error('[SAVE-GAME] Failed to parse audit trail:', error);
        return null;
    }
};

/**
 * Calculate unique players from player list
 */
const calculateUniquePlayersFromList = (input) => {
    if (input.players?.allPlayers && Array.isArray(input.players.allPlayers) && input.players.allPlayers.length > 0) {
        const uniqueNames = new Set();
        for (const player of input.players.allPlayers) {
            if (player.name) {
                const normalizedName = player.name.toLowerCase().trim();
                uniqueNames.add(normalizedName);
            }
        }
        return uniqueNames.size;
    }
    return input.game.totalUniquePlayers || 0;
};

// ===================================================================
// VALIDATION (Simplified - structure only)
// ===================================================================

const validateInput = (input) => {
    const warnings = [];
    const errors = [];
    
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
    
    // Warnings for missing optional fields
    if (!input.game.buyIn && input.game.buyIn !== 0) warnings.push('No buyIn specified');
    if (!input.game.gameVariant) warnings.push('No gameVariant specified');
    
    return { valid: true, errors: [], warnings };
};

// ===================================================================
// FIND EXISTING GAME
// ===================================================================

const findExistingGame = async (input) => {
    const entityId = input.source.entityId;
    
    // Method 1: By existing game ID
    if (input.game.existingGameId) {
        try {
            const result = await monitoredDdbDocClient.send(new GetCommand({
                TableName: getTableName('Game'),
                Key: { id: input.game.existingGameId }
            }));
            if (result.Item) return result.Item;
        } catch (error) {
            console.error('[SAVE-GAME] Error fetching by existingGameId:', error);
        }
    }
    
    // Method 2: By sourceUrl (for scrapes)
    if (input.source.type === 'SCRAPE' && input.source.sourceId) {
        try {
            const result = await monitoredDdbDocClient.send(new QueryCommand({
                TableName: getTableName('Game'),
                IndexName: 'bySourceUrl',
                KeyConditionExpression: 'sourceUrl = :url',
                ExpressionAttributeValues: { ':url': input.source.sourceId }
            }));
            if (result.Items?.[0]) return result.Items[0];
        } catch (error) {
            console.error('[SAVE-GAME] Error querying by sourceUrl:', error);
        }
    }
    
    // Method 3: By entity + tournamentId
    if (input.game.tournamentId && entityId) {
        try {
            const result = await monitoredDdbDocClient.send(new QueryCommand({
                TableName: getTableName('Game'),
                IndexName: 'byEntityAndTournamentId',
                KeyConditionExpression: 'entityId = :entityId AND tournamentId = :tid',
                ExpressionAttributeValues: {
                    ':entityId': entityId,
                    ':tid': input.game.tournamentId
                }
            }));
            if (result.Items?.[0]) return result.Items[0];
        } catch (error) {
            console.error('[SAVE-GAME] Error querying by tournamentId:', error);
        }
    }
    
    return null;
};

// ===================================================================
// SCRAPE URL TRACKING
// ===================================================================

const updateScrapeURL = async (sourceUrl, gameId, gameStatus, doNotScrape = false, wasEdited = false) => {
    if (!sourceUrl) return;
    
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    let status = 'ACTIVE';
    if (doNotScrape) status = 'DO_NOT_SCRAPE';
    else if (FINISHED_STATUSES.includes(gameStatus)) status = 'INACTIVE';
    
    const attemptStatus = wasEdited 
        ? (gameStatus === 'FINISHED' ? 'SAVED_EDITED' : 'UPDATED_EDITED')
        : (gameStatus === 'FINISHED' ? 'SAVED' : 'UPDATED');
    
    try {
        // Check if exists
        const existingResult = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: scrapeURLTable,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': sourceUrl }
        }));
        
        if (existingResult.Items?.[0]) {
            const existing = existingResult.Items[0];
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: scrapeURLTable,
                Key: { id: existing.id },
                UpdateExpression: 'SET #status = :status, gameId = :gameId, lastScrapedAt = :now, lastAttemptStatus = :attemptStatus, updatedAt = :now, #lastChanged = :ts',
                ExpressionAttributeNames: { '#status': 'status', '#lastChanged': '_lastChangedAt' },
                ExpressionAttributeValues: { ':status': status, ':gameId': gameId, ':now': now, ':attemptStatus': attemptStatus, ':ts': timestamp }
            }));
        } else {
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: scrapeURLTable,
                Item: {
                    id: uuidv4(), url: sourceUrl, status, gameId, lastScrapedAt: now, lastAttemptStatus: attemptStatus,
                    createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: timestamp, __typename: 'ScrapeURL'
                }
            }));
        }
    } catch (error) {
        console.error('[SAVE-GAME] Error updating ScrapeURL:', error);
    }
};

const createScrapeAttempt = async (input, gameId, wasNewGame, fieldsUpdated) => {
    if (input.source.type !== 'SCRAPE') return;
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    let attemptStatus;
    if (input.source.wasEdited) {
        attemptStatus = wasNewGame ? 'SUCCESS_EDITED' : (fieldsUpdated.length > 0 ? 'UPDATED_EDITED' : 'NO_CHANGES');
    } else {
        attemptStatus = wasNewGame ? 'SUCCESS' : (fieldsUpdated.length > 0 ? 'UPDATED' : 'NO_CHANGES');
    }
    
    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: getTableName('ScrapeAttempt'),
            Item: {
                id: uuidv4(), url: input.source.sourceId, scrapedAt: now, status: attemptStatus,
                gameId, tournamentId: input.game.tournamentId, fieldsUpdated: fieldsUpdated || [],
                wasEdited: input.source.wasEdited || false, entityId: input.source.entityId,
                createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: timestamp, __typename: 'ScrapeAttempt'
            }
        }));
    } catch (error) {
        console.error('[SAVE-GAME] Error creating ScrapeAttempt:', error);
    }
};

// ===================================================================
// PLAYER DATA PROCESSING (SQS)
// ===================================================================

const shouldQueueForPDP = (input, game) => {
    const hasPlayerList = input.players?.allPlayers?.length > 0;
    const playerCount = input.players?.allPlayers?.length || 0;
    const isFinished = FINISHED_STATUSES.includes(game.gameStatus);
    const isLive = LIVE_STATUSES.includes(game.gameStatus);
    
    // DEBUG: Log all decision factors
    console.log('[SAVE-GAME] [SQS-DEBUG] shouldQueueForPDP evaluation:', {
        gameId: game.id,
        gameStatus: game.gameStatus,
        hasPlayerList,
        playerCount,
        isFinished,
        isLive,
        FINISHED_STATUSES,
        LIVE_STATUSES
    });
    
    if (!hasPlayerList) {
        console.log('[SAVE-GAME] [SQS-DEBUG] ❌ Decision: NO QUEUE - No player list provided');
        return { shouldQueue: false, updateEntriesOnly: false };
    }
    if (isFinished) {
        console.log('[SAVE-GAME] [SQS-DEBUG] ✅ Decision: QUEUE FOR PDP - Game is finished with players');
        return { shouldQueue: true, updateEntriesOnly: false };
    }
    if (isLive) {
        console.log('[SAVE-GAME] [SQS-DEBUG] ⏸️ Decision: UPDATE ENTRIES ONLY - Game is live');
        return { shouldQueue: false, updateEntriesOnly: true };
    }
    
    console.log('[SAVE-GAME] [SQS-DEBUG] ❌ Decision: NO QUEUE - Game status not finished or live');
    return { shouldQueue: false, updateEntriesOnly: false };
};

const queueForPDP = async (game, input) => {
    console.log('[SAVE-GAME] [SQS-DEBUG] queueForPDP called:', {
        gameId: game.id,
        entityId: input.source.entityId,
        playerCount: input.players?.allPlayers?.length || 0
    });
    
    if (!PLAYER_PROCESSOR_QUEUE_URL) {
        console.error('[SAVE-GAME] [SQS-DEBUG] ❌ CRITICAL: PLAYER_PROCESSOR_QUEUE_URL not configured!');
        console.error('[SAVE-GAME] [SQS-DEBUG] Available env vars:', Object.keys(process.env).filter(k => k.includes('QUEUE') || k.includes('SQS')));
        return;
    }
    
    console.log('[SAVE-GAME] [SQS-DEBUG] ✅ Queue URL is set, preparing message...');
    
    const messageBody = {
        game: {
            id: game.id,
            entityId: input.source.entityId,
            venueId: game.venueId,
            gameStatus: game.gameStatus,
            gameStartDateTime: game.gameStartDateTime,
            gameEndDateTime: game.gameEndDateTime,
            buyIn: game.buyIn,
            totalUniquePlayers: game.totalUniquePlayers,
            venueAssignmentStatus: game.venueAssignmentStatus
        },
        players: {
            allPlayers: input.players.allPlayers,
            totalUniquePlayers: input.players.totalUniquePlayers || input.players.allPlayers.length,
            hasCompleteResults: input.players.hasCompleteResults,
            totalPrizesPaid: input.players.totalPrizesPaid || 0
        }
    };
    
    const sqsParams = {
        QueueUrl: PLAYER_PROCESSOR_QUEUE_URL,
        MessageBody: JSON.stringify(messageBody),
        MessageGroupId: game.id,
        MessageDeduplicationId: `${game.id}-${Date.now()}`
    };
    
    console.log('[SAVE-GAME] [SQS-DEBUG] SQS SendMessage params:', {
        QueueUrl: sqsParams.QueueUrl,
        MessageGroupId: sqsParams.MessageGroupId,
        MessageDeduplicationId: sqsParams.MessageDeduplicationId,
        MessageBodyLength: sqsParams.MessageBody.length,
        playerCount: input.players.allPlayers.length
    });
    
    try {
        const result = await sqsClient.send(new SendMessageCommand(sqsParams));
        console.log('[SAVE-GAME] [SQS-DEBUG] ✅ SQS SendMessage SUCCESS:', {
            MessageId: result.MessageId,
            SequenceNumber: result.SequenceNumber,
            gameId: game.id,
            playerCount: input.players.allPlayers.length
        });
    } catch (error) {
        console.error('[SAVE-GAME] [SQS-DEBUG] ❌ SQS SendMessage FAILED:', {
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            gameId: game.id,
            queueUrl: PLAYER_PROCESSOR_QUEUE_URL
        });
        // Re-throw to surface the error if needed
        throw error;
    }
};

const updatePlayerEntries = async (game, input) => {
    // Update existing player entries without full reprocessing (for live games)
    console.log(`[SAVE-GAME] Updating player entries for live game ${game.id}`);
    // Implementation would update PlayerEntry records inline
};



// ===================================================================
// CREATE GAME (Expects pre-enriched data)
// ===================================================================

const createGame = async (input) => {
    const gameId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const gameData = input.game;
    const entityId = input.source.entityId;

    monitoring.trackOperation('CREATE', 'Game', gameId, { entityId, tournamentId: gameData.tournamentId });

    const gameStartDateTime = ensureISODate(gameData.gameStartDateTime);
    const totalUniquePlayers = calculateUniquePlayersFromList(input);

    const game = {
        id: gameId,
        // Core fields
        name: gameData.name,
        gameType: gameData.gameType,
        gameVariant: gameData.gameVariant || 'NLHE',
        gameStatus: gameData.gameStatus,
        gameStartDateTime: gameStartDateTime,
        gameEndDateTime: gameData.gameEndDateTime ? ensureISODate(gameData.gameEndDateTime) : null,
        registrationStatus: gameData.registrationStatus || 'N_A',
        gameFrequency: gameData.gameFrequency || 'UNKNOWN',
        
        // Financials (pre-calculated by enricher)
        buyIn: gameData.buyIn || 0,
        rake: gameData.rake || 0,
        venueFee: gameData.venueFee || 0,
        hasGuarantee: gameData.hasGuarantee || false,
        guaranteeAmount: gameData.guaranteeAmount || 0,
        startingStack: gameData.startingStack || 0,
        rakeRevenue: gameData.rakeRevenue || 0,
        totalBuyInsCollected: gameData.totalBuyInsCollected || 0,
        prizepoolPlayerContributions: gameData.prizepoolPlayerContributions || 0,
        prizepoolAddedValue: gameData.prizepoolAddedValue || 0,
        prizepoolSurplus: gameData.prizepoolSurplus,
        guaranteeOverlayCost: gameData.guaranteeOverlayCost || 0,
        gameProfit: gameData.gameProfit || 0,
        
        // Jackpot contributions (inherited from RecurringGame)
        hasJackpotContributions: gameData.hasJackpotContributions || false,
        jackpotContributionAmount: gameData.jackpotContributionAmount || null,
        
        // Accumulator tickets (inherited from RecurringGame)
        hasAccumulatorTickets: gameData.hasAccumulatorTickets || false,
        accumulatorTicketValue: gameData.accumulatorTicketValue || null,
        numberOfAccumulatorTicketsPaid: gameData.numberOfAccumulatorTicketsPaid || null,
        
        // Entry counts
        totalUniquePlayers: totalUniquePlayers,
        totalInitialEntries: gameData.totalInitialEntries || 0,
        totalEntries: gameData.totalEntries || 0,
        totalRebuys: gameData.totalRebuys || 0,
        totalAddons: gameData.totalAddons || 0,
        
        // Results
        prizepoolPaid: gameData.prizepoolPaid || 0,
        prizepoolCalculated: gameData.prizepoolCalculated || 0,
        playersRemaining: gameData.playersRemaining || null,
        totalChipsInPlay: gameData.totalChipsInPlay || null,
        averagePlayerStack: gameData.averagePlayerStack || null,
        totalDuration: gameData.totalDuration || null,
        
        // Categorization
        tournamentType: gameData.tournamentType,
        isSeries: gameData.isSeries || false,
        isSatellite: gameData.isSatellite || false,
        isRegular: gameData.isRegular || false,
        gameTags: gameData.gameTags || [],
        levels: gameData.levels || [],
        
        // Source
        sourceUrl: input.source.type === 'SCRAPE' ? input.source.sourceId : null,
        tournamentId: gameData.tournamentId,
        wasEdited: input.source.wasEdited || false,
        
        // Venue (pre-resolved by enricher)
        venueId: gameData.venueId || input.venue?.venueId,
        venueAssignmentStatus: gameData.venueAssignmentStatus || input.venue?.status || 'PENDING_ASSIGNMENT',
        venueAssignmentConfidence: gameData.venueAssignmentConfidence || input.venue?.confidence || 0,
        suggestedVenueName: gameData.suggestedVenueName,
        requiresVenueAssignment: !gameData.venueId || gameData.venueId === UNASSIGNED_VENUE_ID,
        
        // Series (pre-resolved by enricher)
        tournamentSeriesId: gameData.tournamentSeriesId,
        seriesName: gameData.seriesName,
        seriesAssignmentStatus: gameData.seriesAssignmentStatus || 'NOT_SERIES',
        seriesAssignmentConfidence: gameData.seriesAssignmentConfidence || 0,
        suggestedSeriesName: gameData.suggestedSeriesName,
        isMainEvent: gameData.isMainEvent || false,
        eventNumber: gameData.eventNumber || null,
        dayNumber: gameData.dayNumber || null,
        flightLetter: gameData.flightLetter || null,
        finalDay: gameData.finalDay || false,
        
        // Recurring game (pre-resolved by enricher)
        recurringGameId: gameData.recurringGameId,
        recurringGameAssignmentStatus: gameData.recurringGameAssignmentStatus || 'PENDING_ASSIGNMENT',
        recurringGameAssignmentConfidence: gameData.recurringGameAssignmentConfidence || 0,
        wasScheduledInstance: gameData.wasScheduledInstance || false,
        deviationNotes: gameData.deviationNotes,
        instanceNumber: gameData.instanceNumber,
        
        // Query keys (pre-computed by enricher)
        gameDayOfWeek: gameData.gameDayOfWeek,
        gameYearMonth: gameData.gameYearMonth || getYearMonth(gameStartDateTime),
        buyInBucket: gameData.buyInBucket,
        venueScheduleKey: gameData.venueScheduleKey,
        venueGameTypeKey: gameData.venueGameTypeKey,
        entityQueryKey: gameData.entityQueryKey,
        entityGameTypeKey: gameData.entityGameTypeKey,
        
        // ===================================================================
        // NEW: Classification fields (from gameDataEnricher)
        // ===================================================================
        
        // Universal classification
        sessionMode: gameData.sessionMode || null,
        variant: gameData.variant || null,
        bettingStructure: gameData.bettingStructure || null,
        speedType: gameData.speedType || null,
        tableSize: gameData.tableSize || null,
        maxPlayers: gameData.maxPlayers || null,
        dealType: gameData.dealType || null,
        buyInTier: gameData.buyInTier || null,
        
        // Tournament classification
        // NOTE: entryStructure (not tournamentStructure) to avoid @model conflict
        entryStructure: gameData.entryStructure || null,
        bountyType: gameData.bountyType || null,
        bountyAmount: gameData.bountyAmount || null,
        bountyPercentage: gameData.bountyPercentage || null,
        tournamentPurpose: gameData.tournamentPurpose || null,
        stackDepth: gameData.stackDepth || null,
        lateRegistration: gameData.lateRegistration || null,
        payoutStructure: gameData.payoutStructure || null,
        scheduleType: gameData.scheduleType || null,
        
        // Tournament feature flags
        isShootout: gameData.isShootout || null,
        isSurvivor: gameData.isSurvivor || null,
        isFlipAndGo: gameData.isFlipAndGo || null,
        isWinTheButton: gameData.isWinTheButton || null,
        isAnteOnly: gameData.isAnteOnly || null,
        isBigBlindAnte: gameData.isBigBlindAnte || null,
        
        // Cash game classification
        // NOTE: cashRakeType (not rakeStructure) to avoid @model conflict
        cashGameType: gameData.cashGameType || null,
        cashRakeType: gameData.cashRakeType || null,
        hasBombPots: gameData.hasBombPots || null,
        hasRunItTwice: gameData.hasRunItTwice || null,
        hasStraddle: gameData.hasStraddle || null,
        
        // Mixed game support
        mixedGameRotation: gameData.mixedGameRotation || null,
        
        // Classification metadata
        classificationSource: gameData.classificationSource || null,
        classificationConfidence: gameData.classificationConfidence || null,
        lastClassifiedAt: gameData.lastClassifiedAt || null,
        
        // Entity & timestamps
        entityId: entityId,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'Game'
    };

    // Handle audit trail if provided
    if (input.auditTrail) {
        const auditInfo = parseAuditTrail(input.auditTrail);
        if (auditInfo) {
            game.lastEditedAt = auditInfo.editedAt;
            game.lastEditedBy = auditInfo.editedBy;
            game.editHistory = JSON.stringify([auditInfo]);
        }
    }

    await monitoredDdbDocClient.send(new PutCommand({ TableName: getTableName('Game'), Item: game }));
    console.log(`[SAVE-GAME] ✅ Created game: ${gameId}`);

    return { gameId, game, wasNewGame: true, fieldsUpdated: [] };
};

// ===================================================================
// UPDATE GAME (Expects pre-enriched data)
// ===================================================================

const updateGame = async (existingGame, input) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const gameData = input.game;
    const entityId = input.source.entityId;

    monitoring.trackOperation('UPDATE', 'Game', existingGame.id, { entityId, wasEdited: input.source.wasEdited });

    // Track which fields changed
    const fieldsUpdated = [];
    const updates = {};

    // Fields to check for updates
    const fieldMappings = {
        // Core fields
        name: 'name',
        gameStatus: 'gameStatus',
        registrationStatus: 'registrationStatus',
        
        // Entry counts
        totalUniquePlayers: 'totalUniquePlayers',
        totalInitialEntries: 'totalInitialEntries',
        totalEntries: 'totalEntries',
        totalRebuys: 'totalRebuys',
        totalAddons: 'totalAddons',
        
        // Results
        prizepoolPaid: 'prizepoolPaid',
        prizepoolCalculated: 'prizepoolCalculated',
        playersRemaining: 'playersRemaining',
        totalChipsInPlay: 'totalChipsInPlay',
        averagePlayerStack: 'averagePlayerStack',
        totalDuration: 'totalDuration',
        
        // Pre-calculated financials
        rakeRevenue: 'rakeRevenue',
        totalBuyInsCollected: 'totalBuyInsCollected',
        prizepoolPlayerContributions: 'prizepoolPlayerContributions',
        prizepoolAddedValue: 'prizepoolAddedValue',
        prizepoolSurplus: 'prizepoolSurplus',
        guaranteeOverlayCost: 'guaranteeOverlayCost',
        gameProfit: 'gameProfit',
        
        // Jackpot contributions (inherited from RecurringGame)
        hasJackpotContributions: 'hasJackpotContributions',
        jackpotContributionAmount: 'jackpotContributionAmount',
        
        // Accumulator tickets (inherited from RecurringGame)
        hasAccumulatorTickets: 'hasAccumulatorTickets',
        accumulatorTicketValue: 'accumulatorTicketValue',
        numberOfAccumulatorTicketsPaid: 'numberOfAccumulatorTicketsPaid',
        
        // Pre-resolved venue
        venueId: 'venueId',
        venueAssignmentStatus: 'venueAssignmentStatus',
        venueAssignmentConfidence: 'venueAssignmentConfidence',
        venueFee: 'venueFee',
        
        // Pre-resolved series
        tournamentSeriesId: 'tournamentSeriesId',
        seriesName: 'seriesName',
        seriesAssignmentStatus: 'seriesAssignmentStatus',
        seriesAssignmentConfidence: 'seriesAssignmentConfidence',
        
        // Pre-resolved recurring
        recurringGameId: 'recurringGameId',
        recurringGameAssignmentStatus: 'recurringGameAssignmentStatus',
        recurringGameAssignmentConfidence: 'recurringGameAssignmentConfidence',
        
        // Pre-computed query keys
        gameDayOfWeek: 'gameDayOfWeek',
        buyInBucket: 'buyInBucket',
        venueScheduleKey: 'venueScheduleKey',
        venueGameTypeKey: 'venueGameTypeKey',
        entityQueryKey: 'entityQueryKey',
        entityGameTypeKey: 'entityGameTypeKey',
        
        // ===================================================================
        // NEW: Classification field
        // ===================================================================
        
        // Universal classification
        sessionMode: 'sessionMode',
        variant: 'variant',
        bettingStructure: 'bettingStructure',
        speedType: 'speedType',
        tableSize: 'tableSize',
        maxPlayers: 'maxPlayers',
        dealType: 'dealType',
        buyInTier: 'buyInTier',
        
        // Tournament classification
        entryStructure: 'entryStructure',
        bountyType: 'bountyType',
        bountyAmount: 'bountyAmount',
        bountyPercentage: 'bountyPercentage',
        tournamentPurpose: 'tournamentPurpose',
        stackDepth: 'stackDepth',
        lateRegistration: 'lateRegistration',
        payoutStructure: 'payoutStructure',
        scheduleType: 'scheduleType',
        
        // Tournament feature flags
        isShootout: 'isShootout',
        isSurvivor: 'isSurvivor',
        isFlipAndGo: 'isFlipAndGo',
        isWinTheButton: 'isWinTheButton',
        isAnteOnly: 'isAnteOnly',
        isBigBlindAnte: 'isBigBlindAnte',
        
        // Cash game classification
        cashGameType: 'cashGameType',
        cashRakeType: 'cashRakeType',
        hasBombPots: 'hasBombPots',
        hasRunItTwice: 'hasRunItTwice',
        hasStraddle: 'hasStraddle',
        
        // Mixed game support
        mixedGameRotation: 'mixedGameRotation',
        
        // Classification metadata
        classificationSource: 'classificationSource',
        classificationConfidence: 'classificationConfidence',
        lastClassifiedAt: 'lastClassifiedAt',
        gameYearMonth: 'gameYearMonth'
    };

    for (const [inputField, dbField] of Object.entries(fieldMappings)) {
        const newValue = gameData[inputField];
        const oldValue = existingGame[dbField];
        if (newValue !== undefined && newValue !== oldValue) {
            updates[dbField] = newValue;
            fieldsUpdated.push(dbField);
        }
    }

    // Always update timestamps
    updates.updatedAt = now;
    updates._lastChangedAt = timestamp;
    updates._version = (existingGame._version || 1) + 1;

    // Handle wasEdited flag
    if (input.source.wasEdited && !existingGame.wasEdited) {
        updates.wasEdited = true;
        fieldsUpdated.push('wasEdited');
    }

    // Build update expression
    if (fieldsUpdated.length === 0) {
        console.log(`[SAVE-GAME] No changes detected for game ${existingGame.id}`);
        return { gameId: existingGame.id, game: existingGame, wasNewGame: false, fieldsUpdated: [] };
    }

    const updateExpression = 'SET ' + Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
    const expressionAttributeValues = Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]]));

    await monitoredDdbDocClient.send(new UpdateCommand({
        TableName: getTableName('Game'),
        Key: { id: existingGame.id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));

    console.log(`[SAVE-GAME] ✅ Updated game ${existingGame.id}: ${fieldsUpdated.join(', ')}`);

    const updatedGame = { ...existingGame, ...updates };
    return { gameId: existingGame.id, game: updatedGame, wasNewGame: false, fieldsUpdated };
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[SAVE-GAME] v4.1.0 - Pure Writer (pre-enriched data) with classification fields');
    
    // Handle both direct invocation and GraphQL resolver invocation
    const input = event.arguments?.input || event.input || event;

    // DEBUG: Log input structure for SQS debugging
    console.log('[SAVE-GAME] [SQS-DEBUG] Input structure check:', {
        hasPlayers: !!input.players,
        hasAllPlayers: !!input.players?.allPlayers,
        playerCount: input.players?.allPlayers?.length || 0,
        gameStatus: input.game?.gameStatus,
        sourceType: input.source?.type,
        entityId: input.source?.entityId
    });

    try {
        // Validate input structure
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

        if (input.options?.validateOnly) {
            return { success: true, action: 'VALIDATED', message: 'Input validation passed', warnings: validation.warnings };
        }

        // Find existing game
        const existingGame = await findExistingGame(input);

        // Create or update
        let saveResult;
        if (existingGame && !input.options?.forceUpdate) {
            // Check for meaningful changes
            const hasChanges = 
                input.game.gameStatus !== existingGame.gameStatus ||
                input.game.totalUniquePlayers !== existingGame.totalUniquePlayers ||
                input.game.totalEntries !== existingGame.totalEntries ||
                input.game.prizepoolPaid !== existingGame.prizepoolPaid ||
                input.source.wasEdited;

            if (!hasChanges) {
                console.log(`[SAVE-GAME] Game exists with no changes, skipping`);
                saveResult = { gameId: existingGame.id, game: existingGame, wasNewGame: false, fieldsUpdated: [] };
            } else {
                saveResult = await updateGame(existingGame, input);
            }
        } else if (existingGame && input.options?.forceUpdate) {
            saveResult = await updateGame(existingGame, input);
        } else {
            saveResult = await createGame(input);
        }

        const { gameId, game, wasNewGame, fieldsUpdated } = saveResult;

        // Update scrape tracking
        if (input.source.type === 'SCRAPE') {
            await updateScrapeURL(input.source.sourceId, gameId, game.gameStatus, input.options?.doNotScrape, input.source.wasEdited);
            await createScrapeAttempt(input, gameId, wasNewGame, fieldsUpdated);
        }

        // Player processing
        console.log('[SAVE-GAME] [SQS-DEBUG] Starting player processing evaluation...');
        const pdpDecision = shouldQueueForPDP(input, game);
        let playerProcessingQueued = false;
        let playerProcessingReason = null;

        console.log('[SAVE-GAME] [SQS-DEBUG] PDP decision result:', pdpDecision);

        if (pdpDecision.shouldQueue) {
            console.log('[SAVE-GAME] [SQS-DEBUG] Calling queueForPDP...');
            await queueForPDP(game, input);
            playerProcessingQueued = true;
            playerProcessingReason = 'Game finished with player list';
            console.log('[SAVE-GAME] [SQS-DEBUG] queueForPDP completed');
        } else if (pdpDecision.updateEntriesOnly) {
            await updatePlayerEntries(game, input);
            playerProcessingReason = 'Live game - entries updated inline';
        } else {
            console.log('[SAVE-GAME] [SQS-DEBUG] No player processing action taken');
            playerProcessingReason = 'No queue action - check logs for reason';
        }

        // NOTE: GameCost and GameFinancialSnapshot are now created by
        // gameFinancialsProcessor Lambda (triggered via EventBridge/DynamoDB Streams)

        // Build response
        const action = wasNewGame ? 'CREATED' : fieldsUpdated.length > 0 ? 'UPDATED' : 'SKIPPED';

        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', action, { gameId, entityId: input.source.entityId });

        return {
            success: true,
            gameId: gameId,
            action: action,
            message: wasNewGame ? 'Game created' : `Game ${action.toLowerCase()}`,
            warnings: validation.warnings,
            playerProcessingQueued,
            playerProcessingReason,
            venueAssignment: {
                venueId: game.venueId,
                venueName: input.venue?.venueName,
                venueFee: game.venueFee,
                status: game.venueAssignmentStatus,
                confidence: game.venueAssignmentConfidence
            },
            seriesAssignment: {
                tournamentSeriesId: game.tournamentSeriesId,
                seriesName: game.seriesName,
                status: game.seriesAssignmentStatus,
                confidence: game.seriesAssignmentConfidence
            },
            recurringGameAssignment: {
                recurringGameId: game.recurringGameId,
                status: game.recurringGameAssignmentStatus,
                confidence: game.recurringGameAssignmentConfidence
            },
            fieldsUpdated,
            wasEdited: input.source.wasEdited || false
        };

    } catch (error) {
        console.error('[SAVE-GAME] Error:', error);
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'error', { error: error.message });
        return { success: false, action: 'ERROR', message: error.message || 'Internal error' };
    } finally {
        if (monitoring) {
            await monitoring.flush();
        }
    }
};