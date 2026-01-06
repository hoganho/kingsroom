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
    API_KINGSROOM_ACTIVEGAMETABLE_NAME
    API_KINGSROOM_RECENTLYFINISHEDGAMETABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * SAVEGAME LAMBDA FUNCTION - PURE WRITER (v4.4.0)
 * ===================================================================
 * 
 * VERSION: 4.4.0
 * - Added gameActualStartDateTime field support
 * - Fixed gameEndDateTime not updating on existing games (was missing from fieldMappings)
 * - Duration fields now properly sync to database
 * 
 * VERSION: 4.3.0
 * - Added content hash for meaningful change detection
 * - Downstream Lambdas can now skip non-meaningful updates
 * - Removed lambda-monitoring (deprecated)
 * 
 * VERSION: 4.2.0
 * - Added ActiveGame table synchronization for dashboard queries
 * - Games in RUNNING/REGISTERING/CLOCK_STOPPED sync to ActiveGame
 * - FINISHED games move to RecentlyFinishedGame (7-day TTL)
 * 
 * RESPONSIBILITIES:
 * This Lambda is a "pure writer" that accepts pre-enriched data
 * from gameDataEnricher and writes it to the database.
 * 
 * WHAT THIS LAMBDA DOES:
 * - Validates input structure (not business rules)
 * - Creates or updates Game records in DynamoDB
 * - Calculates content hash for meaningful change detection
 * - Updates ScrapeURL tracking
 * - Creates ScrapeAttempt records
 * - Queues player data for processing (SQS)
 * - Syncs ActiveGame/RecentlyFinishedGame tables for dashboard
 * 
 * CONTENT HASH:
 * - Only updates dataChangedAt when meaningful fields change
 * - Downstream Lambdas can compare OldImage vs NewImage dataChangedAt
 * - Skip processing if dataChangedAt unchanged
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// ActiveGame Sync
const { syncActiveGame } = require('./syncActiveGame');

// Content Hash for meaningful change detection
const { 
    detectMeaningfulChanges, 
    calculateGameContentHash 
} = require('./gameContentHash');

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

// Environment variables
const PLAYER_PROCESSOR_QUEUE_URL = process.env.PLAYER_PROCESSOR_QUEUE_URL;

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
            const result = await ddbDocClient.send(new GetCommand({
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
            const result = await ddbDocClient.send(new QueryCommand({
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
            const result = await ddbDocClient.send(new QueryCommand({
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
        const existingResult = await ddbDocClient.send(new QueryCommand({
            TableName: scrapeURLTable,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': sourceUrl }
        }));
        
        if (existingResult.Items?.[0]) {
            const existing = existingResult.Items[0];
            await ddbDocClient.send(new UpdateCommand({
                TableName: scrapeURLTable,
                Key: { id: existing.id },
                UpdateExpression: 'SET #status = :status, gameId = :gameId, lastScrapedAt = :now, lastAttemptStatus = :attemptStatus, updatedAt = :now, #lastChanged = :ts',
                ExpressionAttributeNames: { '#status': 'status', '#lastChanged': '_lastChangedAt' },
                ExpressionAttributeValues: { ':status': status, ':gameId': gameId, ':now': now, ':attemptStatus': attemptStatus, ':ts': timestamp }
            }));
        } else {
            await ddbDocClient.send(new PutCommand({
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
        await ddbDocClient.send(new PutCommand({
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

/**
 * Determine if game should be queued for Player Data Processor (PDP)
 * 
 * REQUIREMENTS FOR QUEUING:
 * 1. Must have player list
 * 2. Must be in FINISHED status
 * 3. Must be a NEW transition to FINISHED (not already finished before)
 * 4. Must have meaningful changes (content hash changed) - for updates
 * 
 * @param {Object} input - Save input
 * @param {Object} game - Game being saved
 * @param {boolean} wasNewGame - Whether this is a new game
 * @param {Object} existingGame - Previous game state (null for new games)
 * @param {boolean} meaningfulChange - Whether content hash changed
 */
const shouldQueueForPDP = (input, game, wasNewGame = true, existingGame = null, meaningfulChange = true) => {
    const hasPlayerList = input.players?.allPlayers?.length > 0;
    const isFinished = FINISHED_STATUSES.includes(game.gameStatus);
    const isLive = LIVE_STATUSES.includes(game.gameStatus);
    const wasAlreadyFinished = existingGame && FINISHED_STATUSES.includes(existingGame.gameStatus);
    
    // Must have player list
    if (!hasPlayerList) {
        console.log('[SAVE-GAME] PDP skip: No player list');
        return { shouldQueue: false, updateEntriesOnly: false, reason: 'No player list' };
    }
    
    // For updates: must have meaningful change to re-process
    if (!wasNewGame && !meaningfulChange) {
        console.log('[SAVE-GAME] PDP skip: No meaningful change');
        return { shouldQueue: false, updateEntriesOnly: false, reason: 'No meaningful change' };
    }
    
    // Already processed this finished game (no status transition)
    if (isFinished && wasAlreadyFinished && !wasNewGame) {
        console.log('[SAVE-GAME] PDP skip: Already processed as FINISHED');
        return { shouldQueue: false, updateEntriesOnly: false, reason: 'Already processed as FINISHED' };
    }
    
    // Queue for finished games with players
    if (isFinished) {
        console.log('[SAVE-GAME] PDP queue: FINISHED with players');
        return { shouldQueue: true, updateEntriesOnly: false, reason: 'Game finished with players' };
    }
    
    // Live games just update entries inline
    if (isLive) {
        console.log('[SAVE-GAME] PDP: Live game - update entries only');
        return { shouldQueue: false, updateEntriesOnly: true, reason: 'Live game' };
    }
    
    return { shouldQueue: false, updateEntriesOnly: false, reason: 'Not finished or live' };
};

const queueForPDP = async (game, input) => {
    if (!PLAYER_PROCESSOR_QUEUE_URL) {
        console.error('[SAVE-GAME] PLAYER_PROCESSOR_QUEUE_URL not configured');
        return;
    }
    
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
        MessageDeduplicationId: game.id
    };
    
    try {
        const result = await sqsClient.send(new SendMessageCommand(sqsParams));
        console.log('[SAVE-GAME] Queued for PDP:', { gameId: game.id, messageId: result.MessageId });
    } catch (error) {
        console.error('[SAVE-GAME] SQS send failed:', error.message);
        throw error;
    }
};

const updatePlayerEntries = async (game, input) => {
    // Update existing player entries without full reprocessing (for live games)
    console.log(`[SAVE-GAME] Updating player entries for live game ${game.id}`);
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
        // NEW: Actual start time (for duration calculations)
        gameActualStartDateTime: gameData.gameActualStartDateTime ? ensureISODate(gameData.gameActualStartDateTime) : null,
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
        
        // Jackpot contributions
        hasJackpotContributions: gameData.hasJackpotContributions || false,
        jackpotContributionAmount: gameData.jackpotContributionAmount || null,
        
        // Accumulator tickets
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
        
        // Classification fields
        sessionMode: gameData.sessionMode || null,
        variant: gameData.variant || null,
        bettingStructure: gameData.bettingStructure || null,
        speedType: gameData.speedType || null,
        tableSize: gameData.tableSize || null,
        maxPlayers: gameData.maxPlayers || null,
        dealType: gameData.dealType || null,
        buyInTier: gameData.buyInTier || null,
        entryStructure: gameData.entryStructure || null,
        bountyType: gameData.bountyType || null,
        bountyAmount: gameData.bountyAmount || null,
        bountyPercentage: gameData.bountyPercentage || null,
        tournamentPurpose: gameData.tournamentPurpose || null,
        stackDepth: gameData.stackDepth || null,
        lateRegistration: gameData.lateRegistration || null,
        payoutStructure: gameData.payoutStructure || null,
        scheduleType: gameData.scheduleType || null,
        isShootout: gameData.isShootout || null,
        isSurvivor: gameData.isSurvivor || null,
        isFlipAndGo: gameData.isFlipAndGo || null,
        isWinTheButton: gameData.isWinTheButton || null,
        isAnteOnly: gameData.isAnteOnly || null,
        isBigBlindAnte: gameData.isBigBlindAnte || null,
        cashGameType: gameData.cashGameType || null,
        cashRakeType: gameData.cashRakeType || null,
        hasBombPots: gameData.hasBombPots || null,
        hasRunItTwice: gameData.hasRunItTwice || null,
        hasStraddle: gameData.hasStraddle || null,
        mixedGameRotation: gameData.mixedGameRotation || null,
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

    // ═══════════════════════════════════════════════════════════════════
    // CONTENT HASH: Calculate initial hash for new game
    // New games are always meaningful changes
    // ═══════════════════════════════════════════════════════════════════
    game.contentHash = calculateGameContentHash(game);
    game.dataChangedAt = now;
    console.log('[SAVE-GAME] New game content hash:', game.contentHash);

    await ddbDocClient.send(new PutCommand({ TableName: getTableName('Game'), Item: game }));
    console.log(`[SAVE-GAME] ✅ Created game: ${gameId}`);

    return { gameId, game, wasNewGame: true, fieldsUpdated: [], meaningfulChange: true };
};

// ===================================================================
// UPDATE GAME (Expects pre-enriched data)
// ===================================================================

const updateGame = async (existingGame, input) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const gameData = input.game;
    const entityId = input.source.entityId;

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
        
        // Jackpot contributions
        hasJackpotContributions: 'hasJackpotContributions',
        jackpotContributionAmount: 'jackpotContributionAmount',
        
        // Accumulator tickets
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
        gameYearMonth: 'gameYearMonth',
        
        // Classification fields
        sessionMode: 'sessionMode',
        variant: 'variant',
        bettingStructure: 'bettingStructure',
        speedType: 'speedType',
        tableSize: 'tableSize',
        maxPlayers: 'maxPlayers',
        dealType: 'dealType',
        buyInTier: 'buyInTier',
        entryStructure: 'entryStructure',
        bountyType: 'bountyType',
        bountyAmount: 'bountyAmount',
        bountyPercentage: 'bountyPercentage',
        tournamentPurpose: 'tournamentPurpose',
        stackDepth: 'stackDepth',
        lateRegistration: 'lateRegistration',
        payoutStructure: 'payoutStructure',
        scheduleType: 'scheduleType',
        isShootout: 'isShootout',
        isSurvivor: 'isSurvivor',
        isFlipAndGo: 'isFlipAndGo',
        isWinTheButton: 'isWinTheButton',
        isAnteOnly: 'isAnteOnly',
        isBigBlindAnte: 'isBigBlindAnte',
        cashGameType: 'cashGameType',
        cashRakeType: 'cashRakeType',
        hasBombPots: 'hasBombPots',
        hasRunItTwice: 'hasRunItTwice',
        hasStraddle: 'hasStraddle',
        mixedGameRotation: 'mixedGameRotation',
        classificationSource: 'classificationSource',
        classificationConfidence: 'classificationConfidence',
        lastClassifiedAt: 'lastClassifiedAt'
    };

    for (const [inputField, dbField] of Object.entries(fieldMappings)) {
        const newValue = gameData[inputField];
        const oldValue = existingGame[dbField];
        if (newValue !== undefined && newValue !== oldValue) {
            updates[dbField] = newValue;
            fieldsUpdated.push(dbField);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TIMING FIELDS: Special handling for date fields (need ensureISODate)
    // FIXED in v4.4.0: gameEndDateTime was MISSING from updates!
    // ═══════════════════════════════════════════════════════════════════
    const dateFields = ['gameEndDateTime', 'gameActualStartDateTime'];
    for (const field of dateFields) {
        const newValue = gameData[field];
        if (newValue !== undefined && newValue !== null) {
            const normalizedNew = ensureISODate(newValue);
            const existingValue = existingGame[field];
            if (normalizedNew !== existingValue) {
                updates[field] = normalizedNew;
                fieldsUpdated.push(field);
                console.log(`[SAVE-GAME] Timing field update: ${field} = ${normalizedNew}`);
            }
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

    // ═══════════════════════════════════════════════════════════════════
    // CONTENT HASH: Detect meaningful changes
    // Only update dataChangedAt if hash changes
    // ═══════════════════════════════════════════════════════════════════
    const projectedGame = { ...existingGame, ...updates };
    const changeDetection = detectMeaningfulChanges(existingGame, projectedGame);
    let meaningfulChange = false;
    
    if (changeDetection.changed) {
        updates.contentHash = changeDetection.newHash;
        updates.dataChangedAt = now;
        meaningfulChange = true;
        console.log('[SAVE-GAME] Meaningful change:', changeDetection.changedFields.join(', '));
    } else {
        console.log('[SAVE-GAME] No meaningful change, dataChangedAt preserved');
    }

    // Check if any updates to make
    if (fieldsUpdated.length === 0 && !meaningfulChange) {
        console.log(`[SAVE-GAME] No changes detected for game ${existingGame.id}`);
        return { gameId: existingGame.id, game: existingGame, wasNewGame: false, fieldsUpdated: [], meaningfulChange: false };
    }

    const updateExpression = 'SET ' + Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
    const expressionAttributeValues = Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]]));

    await ddbDocClient.send(new UpdateCommand({
        TableName: getTableName('Game'),
        Key: { id: existingGame.id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));

    console.log(`[SAVE-GAME] ✅ Updated game ${existingGame.id}: ${fieldsUpdated.join(', ')} (meaningful: ${meaningfulChange})`);

    const updatedGame = { ...existingGame, ...updates };
    return { gameId: existingGame.id, game: updatedGame, wasNewGame: false, fieldsUpdated, meaningfulChange };
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[SAVE-GAME] v4.4.0 - Pure Writer with Content Hash + Timing Fields');
    
    // Handle both direct invocation and GraphQL resolver invocation
    const input = event.arguments?.input || event.input || event;

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
                input.game.gameEndDateTime !== existingGame.gameEndDateTime ||  // Added timing check
                input.source.wasEdited;

            if (!hasChanges) {
                console.log(`[SAVE-GAME] Game exists with no changes, skipping`);
                saveResult = { gameId: existingGame.id, game: existingGame, wasNewGame: false, fieldsUpdated: [], meaningfulChange: false };
            } else {
                saveResult = await updateGame(existingGame, input);
            }
        } else if (existingGame && input.options?.forceUpdate) {
            saveResult = await updateGame(existingGame, input);
        } else {
            saveResult = await createGame(input);
        }

        const { gameId, game, wasNewGame, fieldsUpdated, meaningfulChange } = saveResult;

        // =====================================================
        // Sync ActiveGame table for dashboard queries
        // =====================================================
        let activeGameSync = null;
        try {
            activeGameSync = await syncActiveGame(
                game,
                input,
                wasNewGame,
                existingGame,
                ddbDocClient
            );
            console.log('[SAVE-GAME] ActiveGame sync result:', activeGameSync);
        } catch (syncError) {
            console.error('[SAVE-GAME] ActiveGame sync error (non-fatal):', syncError.message);
            activeGameSync = { success: false, error: syncError.message };
        }

        // Update scrape tracking
        if (input.source.type === 'SCRAPE') {
            await updateScrapeURL(input.source.sourceId, gameId, game.gameStatus, input.options?.doNotScrape, input.source.wasEdited);
            await createScrapeAttempt(input, gameId, wasNewGame, fieldsUpdated);
        }

        // Player processing - only queue if meaningful change
        const pdpDecision = shouldQueueForPDP(input, game, wasNewGame, existingGame, meaningfulChange);
        let playerProcessingQueued = false;
        let playerProcessingReason = pdpDecision.reason;

        if (pdpDecision.shouldQueue) {
            await queueForPDP(game, input);
            playerProcessingQueued = true;
        } else if (pdpDecision.updateEntriesOnly) {
            await updatePlayerEntries(game, input);
        }

        // Build response
        const action = wasNewGame ? 'CREATED' : fieldsUpdated.length > 0 ? 'UPDATED' : 'SKIPPED';

        return {
            success: true,
            gameId: gameId,
            action: action,
            message: wasNewGame ? 'Game created' : `Game ${action.toLowerCase()}`,
            warnings: validation.warnings,
            meaningfulChange,
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
            wasEdited: input.source.wasEdited || false,
            activeGameSync: activeGameSync ? {
                action: activeGameSync.action,
                success: activeGameSync.success,
                activeGameId: activeGameSync.activeGameId
            } : null
        };

    } catch (error) {
        console.error('[SAVE-GAME] Error:', error);
        return { success: false, action: 'ERROR', message: error.message || 'Internal error' };
    }
};