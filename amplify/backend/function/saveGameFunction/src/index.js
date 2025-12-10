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
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * SAVEGAME LAMBDA FUNCTION - WITH SERIES RESOLUTION & QUERY KEYS
 * 
 * VERSION: 2.1.0 (with totalRebuys calculation fix)
 * 
 * ENTRY FIELD DEFINITIONS:
 * - totalInitialEntries: Number of unique initial buy-ins (no rebuys/addons)
 * - totalRebuys: Number of rebuy entries (calculated: totalEntries - totalUniquePlayers)
 * - totalAddons: Number of addon entries  
 * - totalEntries: Total entries = totalInitialEntries + totalRebuys + totalAddons
 * - totalUniquePlayers: Unique players (may differ from totalInitialEntries in multi-flight)
 * 
 * QUERY OPTIMIZATION KEYS (computed on save):
 * - gameDayOfWeek: Day of week for day-based queries
 * - buyInBucket: Buy-in range for price-based queries
 * - venueScheduleKey: Composite key for venue + day + variant
 * - entityQueryKey: Composite key for entity-wide multi-dimension queries
 * 
 * SERIES RESOLUTION:
 * - Uses TournamentSeriesTitle for template matching
 * - Temporal matching: month → quarter → year
 * - Auto-creates TournamentSeries when needed
 * 
 * SIMPLIFIED FINANCIAL MODEL:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ REVENUE (what we collect)                                                  │
 * │   rakeRevenue = rake × entriesForRake                                      │
 * │   (entriesForRake = totalInitialEntries + totalRebuys, NOT addons)         │
 * │                                                                             │
 * │ PRIZEPOOL (what players receive)                                           │
 * │   prizepoolPlayerContributions = (buyIn - rake) × entriesForRake           │
 * │                                 + buyIn × totalAddons                       │
 * │   prizepoolAddedValue = guaranteeOverlayCost (when we add money)           │
 * │   prizepoolSurplus = excess above guarantee (bonus to players)             │
 * │                                                                             │
 * │ COST (what we pay)                                                          │
 * │   guaranteeOverlayCost = max(0, guarantee - playerContributions)           │
 * │                                                                             │
 * │ PROFIT (simple)                                                             │
 * │   gameProfit = rakeRevenue - guaranteeOverlayCost                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// Series Resolution Module
const {
    resolveSeriesComprehensive,
    updateSeriesDateRange,
    incrementSeriesEventCount
} = require('./series-resolution');

// Lambda Monitoring
const { LambdaMonitoring } = require('./lambda-monitoring');

// Query Key Computation
const { computeGameQueryKeys, shouldRecomputeQueryKeys } = require('./game-query-keys');

// ===================================================================
// CONSTANTS
// ===================================================================

const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";

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
const monitoring = new LambdaMonitoring('saveGameFunction', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

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
    return `${modelName}-${apiId}-${env}`;
};

const getEntityById = async (entityId) => {
    try {
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: getTableName('Entity'),
            Key: { id: entityId }
        }));
        return result.Item;
    } catch (error) {
        console.error(`[SAVE-GAME] Error fetching entity ${entityId}:`, error);
        return null;
    }
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

const extractYearFromDate = (dateValue) => {
    if (!dateValue) return null;
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.getFullYear();
        }
    } catch (error) {
        console.error('[SAVE-GAME] Error extracting year from date:', error);
    }
    return null;
};

/**
 * *** FIX: Calculate unique players from player list ***
 * 
 * Counts unique players by normalizing names and deduplicating.
 * Falls back to scraped value if no player list is provided.
 * 
 * @param {Object} input - The full input object
 * @returns {number} Count of unique players
 */
const calculateUniquePlayersFromList = (input) => {
    // If we have a player list, count unique names
    if (input.players?.allPlayers && Array.isArray(input.players.allPlayers) && input.players.allPlayers.length > 0) {
        const uniqueNames = new Set();
        
        for (const player of input.players.allPlayers) {
            if (player.name) {
                // Normalize: lowercase and trim whitespace
                const normalizedName = player.name.toLowerCase().trim();
                uniqueNames.add(normalizedName);
            }
        }
        
        const uniqueCount = uniqueNames.size;
        
        // Log if there's a discrepancy with scraped value
        const scrapedCount = input.game.totalUniquePlayers || 0;
        if (scrapedCount > 0 && scrapedCount !== uniqueCount) {
            console.log(`[SAVE-GAME] totalUniquePlayers: scraped=${scrapedCount}, calculated from list=${uniqueCount}`);
        }
        
        return uniqueCount;
    }
    
    // Fall back to scraped value if no player list
    return input.game.totalUniquePlayers || 0;
};

/**
 * *** FIX: Calculate totalRebuys from entry data ***
 * 
 * Formula: totalRebuys = totalEntries - totalUniquePlayers
 * 
 * This represents the number of re-entries/rebuys players made beyond their initial entry.
 * For example: 118 totalEntries with 78 unique players = 40 rebuys
 * 
 * @param {number} totalEntries - Total entries (initial + rebuys + addons)
 * @param {number} totalUniquePlayers - Count of unique players
 * @param {number} scrapedRebuys - Value from scraper (may be 0 or null)
 * @param {string} consolidationType - Type of record (PARENT, CHILD, null)
 * @returns {number} Calculated or scraped rebuy count
 */
const calculateTotalRebuys = (totalEntries, totalUniquePlayers, scrapedRebuys, consolidationType) => {
    // For PARENT records, let Tournament Consolidator handle it
    if (consolidationType === 'PARENT') {
        return scrapedRebuys || 0;
    }
    
    // If scraped value exists and is positive, trust it
    if (scrapedRebuys && scrapedRebuys > 0) {
        return scrapedRebuys;
    }
    
    // Calculate: totalRebuys = totalEntries - totalUniquePlayers
    // This works because:
    // - totalEntries = number of total entries (including rebuys)
    // - totalUniquePlayers = number of distinct people
    // - The difference = how many extra entries (rebuys) were made
    if (totalEntries > 0 && totalUniquePlayers > 0 && totalEntries > totalUniquePlayers) {
        const calculated = totalEntries - totalUniquePlayers;
        console.log(`[SAVE-GAME] Calculated totalRebuys: ${totalEntries} - ${totalUniquePlayers} = ${calculated}`);
        return calculated;
    }
    
    return 0;
};

/**
 * Calculate financial metrics - SIMPLIFIED MODEL
 */
const calculateFinancials = (game, venueFee = 0) => {
    // Entry counts
    const totalInitialEntries = game.totalInitialEntries || 0;
    const totalRebuys = game.totalRebuys || 0;
    const totalAddons = game.totalAddons || 0;
    
    // Derived: total entries if not provided
    const totalEntries = game.totalEntries || (totalInitialEntries + totalRebuys + totalAddons);
    
    // Financial inputs
    const buyIn = game.buyIn || 0;
    const rake = game.rake || 0;
    const guaranteeAmount = game.guaranteeAmount || 0;
    const hasGuarantee = game.hasGuarantee && guaranteeAmount > 0;
    
    // Entries that pay rake (initial entries + rebuys, NOT addons)
    const entriesForRake = totalInitialEntries + totalRebuys;
    
    // REVENUE - What we collect (simple)
    const rakeRevenue = rake * entriesForRake;
    const totalBuyInsCollected = buyIn * totalEntries;
    
    // PRIZEPOOL - What players receive
    const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
    const prizepoolFromAddons = buyIn * totalAddons;
    const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
    
    // GUARANTEE IMPACT
    let guaranteeOverlayCost = 0;
    let prizepoolSurplus = null;
    let prizepoolAddedValue = 0;
    
    if (hasGuarantee) {
        const shortfall = guaranteeAmount - prizepoolPlayerContributions;
        
        if (shortfall > 0) {
            guaranteeOverlayCost = shortfall;
            prizepoolAddedValue = shortfall;
            prizepoolSurplus = null;
        } else {
            prizepoolSurplus = -shortfall;
            prizepoolAddedValue = 0;
        }
    }
    
    // PROFIT
    const gameProfit = rakeRevenue - guaranteeOverlayCost;
    
    console.log('[SAVE-GAME] Financial calculations (simplified):', {
        totalInitialEntries, totalRebuys, totalAddons, totalEntries, entriesForRake,
        buyIn, rake, guaranteeAmount, hasGuarantee,
        rakeRevenue, totalBuyInsCollected,
        prizepoolPlayerContributions, prizepoolAddedValue, prizepoolSurplus,
        guaranteeOverlayCost, gameProfit, venueFee
    });
    
    return {
        rakeRevenue,
        totalBuyInsCollected,
        prizepoolPlayerContributions,
        prizepoolAddedValue,
        prizepoolSurplus,
        guaranteeOverlayCost,
        gameProfit,
        totalEntries
    };
};

// ===================================================================
// VALIDATION
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
    
    if (!input.game.buyIn && input.game.buyIn !== 0) warnings.push('No buyIn specified');
    if (!input.game.gameVariant) warnings.push('No gameVariant specified, defaulting to NLHE');
    if (!input.venue) warnings.push('No venue information provided');
    
    if (input.players) {
        if (!input.players.allPlayers || !Array.isArray(input.players.allPlayers)) {
            errors.push('players.allPlayers must be an array');
        } else {
            for (let i = 0; i < input.players.allPlayers.length; i++) {
                if (!input.players.allPlayers[i].name) {
                    errors.push(`players.allPlayers[${i}].name is required`);
                }
            }
        }
    }
    
    const validStatuses = [...FINISHED_STATUSES, ...LIVE_STATUSES, ...SCHEDULED_STATUSES, ...INACTIVE_STATUSES, 'UNKNOWN'];
    if (input.game.gameStatus && !validStatuses.includes(input.game.gameStatus)) {
        warnings.push(`Unknown gameStatus: ${input.game.gameStatus}`);
    }
    
    if (input.source?.wasEdited) {
        console.log('[SAVE-GAME] Processing edited data');
        if (!input.auditTrail) warnings.push('Edited data flagged but no audit trail provided');
    }
    
    return { valid: errors.length === 0, errors, warnings };
};

// ===================================================================
// VENUE RESOLUTION
// ===================================================================

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

const matchVenueByName = async (venueName, entityId) => {
    if (!venueName) return null;
    const normalizedInput = venueName.toLowerCase().trim();
    
    try {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: getTableName('Venue'),
            IndexName: 'byEntityVenue',
            KeyConditionExpression: 'entityId = :entityId',
            ExpressionAttributeValues: { ':entityId': entityId }
        }));
        
        const venues = result.Items || [];
        
        for (const venue of venues) {
            if (venue.name.toLowerCase().trim() === normalizedInput) {
                return { id: venue.id, name: venue.name, confidence: 1.0 };
            }
            if (venue.aliases && Array.isArray(venue.aliases)) {
                for (const alias of venue.aliases) {
                    if (alias.toLowerCase().trim() === normalizedInput) {
                        return { id: venue.id, name: venue.name, confidence: 0.95 };
                    }
                }
            }
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

const resolveVenue = async (venueRef, entityId, preferredStatus = null) => {
    const entity = await getEntityById(entityId);
    const defaultVenueId = entity?.defaultVenueId || null;
    
    if (!venueRef) {
        if (defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0
            };
        }
        return { venueId: UNASSIGNED_VENUE_ID, venueName: UNASSIGNED_VENUE_NAME, status: 'UNASSIGNED', confidence: 0, venueFee: 0 };
    }
    
    // FIX: Check preferredStatus to allow AUTO_ASSIGNED even with a specific ID
    if (venueRef.venueId) {
        const venue = await getVenueById(venueRef.venueId);
        return {
            venueId: venueRef.venueId,
            venueName: venue?.name || venueRef.venueName || 'Unknown',
            // If the input explicitly says AUTO_ASSIGNED, respect it. Otherwise assume MANUAL.
            status: preferredStatus === 'AUTO_ASSIGNED' ? 'AUTO_ASSIGNED' : 'MANUALLY_ASSIGNED',
            confidence: 1.0,
            venueFee: venue?.fee ?? 0
        };
    }
    
    if (venueRef.suggestedVenueId) {
        const venue = await getVenueById(venueRef.suggestedVenueId);
        const confidence = venueRef.confidence || 0.8;
        
        if (confidence < 0.6 && defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0,
                suggestedVenueId: venueRef.suggestedVenueId,
                suggestedVenueName: venue?.name
            };
        }
        
        return {
            venueId: venueRef.suggestedVenueId,
            venueName: venue?.name || venueRef.venueName,
            status: 'AUTO_ASSIGNED',
            confidence,
            venueFee: venue?.fee ?? 0
        };
    }
    
    if (venueRef.venueName) {
        const matched = await matchVenueByName(venueRef.venueName, entityId);
        if (matched) {
            const venue = await getVenueById(matched.id);
            return {
                venueId: matched.id,
                venueName: matched.name,
                status: 'AUTO_ASSIGNED',
                confidence: matched.confidence,
                venueFee: venue?.fee ?? 0
            };
        }
        
        if (defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0,
                suggestedName: venueRef.venueName
            };
        }
        
        return { venueId: UNASSIGNED_VENUE_ID, venueName: UNASSIGNED_VENUE_NAME, status: 'PENDING_ASSIGNMENT', confidence: 0, suggestedName: venueRef.venueName, venueFee: 0 };
    }
    
    if (defaultVenueId) {
        const defaultVenue = await getVenueById(defaultVenueId);
        return {
            venueId: defaultVenueId,
            venueName: defaultVenue?.name || 'Default Venue',
            status: 'AUTO_ASSIGNED',
            confidence: 0.5,
            venueFee: defaultVenue?.fee ?? 0
        };
    }
    
    return { venueId: UNASSIGNED_VENUE_ID, venueName: UNASSIGNED_VENUE_NAME, status: 'UNASSIGNED', confidence: 0, venueFee: 0 };
};

// ===================================================================
// SERIES RESOLUTION
// ===================================================================

const getSeriesById = async (seriesId) => {
    try {
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: getTableName('TournamentSeries'),
            Key: { id: seriesId }
        }));
        return result.Item;
    } catch (error) {
        console.error(`[SAVE-GAME] Error fetching series ${seriesId}:`, error);
        return null;
    }
};

/**
 * Resolve series for a game - uses comprehensive resolution with auto-creation
 */
const resolveSeries = async (seriesRef, entityId, gameStartDateTime, venueId = null) => {
    // Handle non-series case
    if (!seriesRef || (!seriesRef.seriesName && !seriesRef.seriesTitleId)) {
        return {
            tournamentSeriesId: null,
            seriesName: null,
            seriesCategory: null,
            holidayType: null,
            status: 'NOT_SERIES',
            confidence: 0,
            wasCreated: false
        };
    }
    
    // If seriesId is directly provided (manual assignment), use it
    if (seriesRef.seriesId) {
        const series = await getSeriesById(seriesRef.seriesId);
        if (series) {
            return {
                tournamentSeriesId: seriesRef.seriesId,
                seriesName: series.name,
                seriesCategory: series.seriesCategory,
                holidayType: series.holidayType,
                status: 'MANUALLY_ASSIGNED',
                confidence: 1.0,
                wasCreated: false
            };
        }
    }
    
    // Use comprehensive resolution with temporal matching and auto-creation
    try {
        const result = await resolveSeriesComprehensive(
            seriesRef,
            entityId,
            gameStartDateTime,
            venueId,
            monitoredDdbDocClient,
            getTableName,
            monitoring,
            {
                autoCreate: true  // Enable auto-creation of TournamentSeries
            }
        );
        
        return result;
    } catch (error) {
        console.error('[SAVE-GAME] Error in comprehensive series resolution:', error);
        
        // Fallback to basic resolution
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: null,
            holidayType: null,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            wasCreated: false,
            error: error.message
        };
    }
};

// ===================================================================
// GAME OPERATIONS
// ===================================================================

const findExistingGame = async (input) => {
    const gameTable = getTableName('Game');
    monitoring.trackOperation('FIND_EXISTING', 'Game', input.game.tournamentId?.toString() || 'unknown');
    
    if (input.game.existingGameId) {
        const result = await monitoredDdbDocClient.send(new GetCommand({ TableName: gameTable, Key: { id: input.game.existingGameId } }));
        if (result.Item) return result.Item;
    }
    
    if (input.source.type === 'SCRAPE' && input.source.sourceId) {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'bySourceUrl',
            KeyConditionExpression: 'sourceUrl = :url',
            ExpressionAttributeValues: { ':url': input.source.sourceId }
        }));
        if (result.Items && result.Items.length > 0) return result.Items[0];
    }
    
    if (input.game.tournamentId && input.source.entityId) {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byEntityAndTournamentId',
            KeyConditionExpression: 'entityId = :entityId AND tournamentId = :tournamentId',
            ExpressionAttributeValues: { ':entityId': input.source.entityId, ':tournamentId': input.game.tournamentId }
        }));
        if (result.Items && result.Items.length > 0) return result.Items[0];
    }
    
    return null;
};

const getGameCostByGameId = async (gameId) => {
    try {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: getTableName('GameCost'),
            IndexName: 'byGameCost',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
        console.error('[SAVE-GAME] Error fetching GameCost:', error);
        return null;
    }
};

const createOrUpdateGameFinancialSnapshot = async (game, entityId, venueId) => {
    const snapshotTable = getTableName('GameFinancialSnapshot');
    const gameCost = await getGameCostByGameId(game.id);
    const totalCost = gameCost?.totalCost || 0;

    const rakeRevenue = game.rakeRevenue || 0;
    const venueFee = game.venueFee || 0;
    const totalRevenue = rakeRevenue + venueFee;
    const prizepoolPlayerContributions = game.prizepoolPlayerContributions || 0;
    const guaranteeAmount = game.guaranteeAmount || 0;

    const profitLoss = totalRevenue - totalCost - (game.guaranteeOverlayCost || 0);
    const profitMargin = totalRevenue > 0 ? profitLoss / totalRevenue : null;
    const revenuePerPlayer = game.totalUniquePlayers ? totalRevenue / game.totalUniquePlayers : null;
    const costPerPlayer = game.totalUniquePlayers ? totalCost / game.totalUniquePlayers : null;
    const guaranteeCoverageRate = guaranteeAmount > 0 ? prizepoolPlayerContributions / guaranteeAmount : null;
    const guaranteeMet = (game.guaranteeOverlayCost || 0) === 0;

    const now = new Date().toISOString();
    const timestamp = Date.now();

    let existingSnapshot = null;
    try {
        const existingResult = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: snapshotTable,
            IndexName: 'byGameFinancialSnapshot',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': game.id }
        }));
        existingSnapshot = existingResult.Items?.[0] || null;
    } catch (error) {
        console.error('[SAVE-GAME] Error querying GameFinancialSnapshot:', error);
    }

    const snapshotFields = {
        entityId, venueId, gameStartDateTime: game.gameStartDateTime,
        rakeRevenue, totalRevenue, totalVenueFee: venueFee,
        prizepoolPlayerContributions, prizepoolAddedValue: game.prizepoolAddedValue || 0, prizepoolSurplus: game.prizepoolSurplus || null,
        guaranteeAmount, guaranteeOverlayCost: game.guaranteeOverlayCost || 0, guaranteeCoverageRate, guaranteeMet,
        gameProfit: game.gameProfit || 0, totalCost, profitLoss, profitMargin, revenuePerPlayer, costPerPlayer,
        totalDealerCost: gameCost?.totalDealerCost || 0, totalPromotionCost: gameCost?.totalPromotionCost || 0,
        totalFloorStaffCost: gameCost?.totalFloorStaffCost || 0, totalOtherCost: gameCost?.totalOtherCost || 0,
        updatedAt: now, _lastChangedAt: timestamp
    };

    if (existingSnapshot) {
        monitoring.trackOperation('UPDATE', 'GameFinancialSnapshot', existingSnapshot.id);
        const updateExpression = 'SET ' + Object.keys(snapshotFields).map(key => `#${key} = :${key}`).join(', ');
        const expressionAttributeNames = Object.fromEntries(Object.keys(snapshotFields).map(k => [`#${k}`, k]));
        const expressionAttributeValues = Object.fromEntries(Object.keys(snapshotFields).map(k => [`:${k}`, snapshotFields[k]]));

        try {
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: snapshotTable,
                Key: { id: existingSnapshot.id },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
            console.log(`[SAVE-GAME] ✅ Updated GameFinancialSnapshot ${existingSnapshot.id}`);
        } catch (error) {
            console.error('[SAVE-GAME] Error updating GameFinancialSnapshot:', error);
        }
        return existingSnapshot.id;
    }

    const snapshotId = uuidv4();
    monitoring.trackOperation('CREATE', 'GameFinancialSnapshot', snapshotId);

    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: snapshotTable,
            Item: { id: snapshotId, gameId: game.id, ...snapshotFields, createdAt: now, _version: 1, __typename: 'GameFinancialSnapshot' }
        }));
        console.log(`[SAVE-GAME] ✅ Created GameFinancialSnapshot ${snapshotId}`);
        return snapshotId;
    } catch (error) {
        console.error('[SAVE-GAME] Error creating GameFinancialSnapshot:', error);
        return null;
    }
};

const createOrUpdateGameCost = async (gameId, venueId, entityId, gameStartDateTime, totalInitialEntries = 0, totalEntries = 0) => {
    const gameCostTable = getTableName('GameCost');
    const dealerRatePerEntry = 15;
    const computedDealerCost = totalEntries * dealerRatePerEntry;

    try {
        const existingResult = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameCostTable,
            IndexName: 'byGameCost',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));

        if (existingResult.Items && existingResult.Items.length > 0) {
            const existingCost = existingResult.Items[0];
            const now = new Date().toISOString();
            const timestamp = Date.now();

            const totalCost = computedDealerCost +
                            (existingCost.totalTournamentDirectorCost || 0) +
                            (existingCost.totalPrizeContribution || 0) +
                            (existingCost.totalJackpotContribution || 0) +
                            (existingCost.totalPromotionCost || 0) +
                            (existingCost.totalFloorStaffCost || 0) +
                            (existingCost.totalOtherCost || 0);

            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: gameCostTable,
                Key: { id: existingCost.id },
                UpdateExpression: 'SET totalDealerCost = :dc, totalCost = :tc, updatedAt = :now, #lastChanged = :ts, #ver = :ver',
                ExpressionAttributeNames: { '#lastChanged': '_lastChangedAt', '#ver': '_version' },
                ExpressionAttributeValues: { ':dc': computedDealerCost, ':tc': totalCost, ':now': now, ':ts': timestamp, ':ver': (existingCost._version || 1) + 1 }
            }));

            console.log(`[SAVE-GAME] ✅ Updated GameCost: ${existingCost.id}`);
            return existingCost.id;
        }
    } catch (error) {
        console.error('[SAVE-GAME] Error checking existing GameCost:', error);
    }

    const costId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();
    monitoring.trackOperation('CREATE', 'GameCost', costId);

    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: gameCostTable,
            Item: {
                id: costId, gameId, totalDealerCost: computedDealerCost, totalTournamentDirectorCost: 0,
                totalPrizeContribution: 0, totalJackpotContribution: 0, totalPromotionCost: 0, totalFloorStaffCost: 0,
                totalOtherCost: 0, totalCost: computedDealerCost, entityId, venueId, gameDate: gameStartDateTime,
                createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: timestamp, __typename: 'GameCost'
            }
        }));
        console.log(`[SAVE-GAME] ✅ Created GameCost: ${costId}`);
        return costId;
    } catch (error) {
        console.error(`[SAVE-GAME] ❌ Error creating GameCost:`, error);
        return null;
    }
};

// ===================================================================
// CREATE GAME (WITH QUERY KEYS)
// ===================================================================

const createGame = async (input, venueResolution, seriesResolution) => {
    const gameId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();

    monitoring.trackOperation('CREATE', 'Game', gameId, { entityId: input.source.entityId, tournamentId: input.game.tournamentId, wasEdited: input.source.wasEdited, venueFee: venueResolution.venueFee });

    const effectiveVenueFee = input.game.venueFee ?? venueResolution.venueFee ?? 0;
    const financials = calculateFinancials(input.game, effectiveVenueFee);

    // Prepare game start date
    const gameStartDateTime = ensureISODate(input.game.gameStartDateTime);

    // Compute query optimization keys
    const isRegular = input.game.isRegular || false;
    const isSeries = input.game.isSeries || false;
    const isSatellite = input.game.isSatellite || false;
    
    // MODIFIED: Check for NOT_PUBLISHED status
    const isNotPublished = input.game.gameStatus === 'NOT_PUBLISHED';
    
let queryKeys;
    
    if (isNotPublished) {
        console.log(`[SAVE-GAME] Game is NOT_PUBLISHED - omitting query keys`);
        queryKeys = {
            gameDayOfWeek: undefined,
            buyInBucket: undefined,
            venueScheduleKey: undefined,
            entityQueryKey: undefined,
            venueGameTypeKey: undefined,
            entityGameTypeKey: undefined
        };
    } else {
        queryKeys = computeGameQueryKeys({
            gameStartDateTime: gameStartDateTime,
            buyIn: input.game.buyIn || 0,
            gameVariant: input.game.gameVariant || 'NLHE',
            venueId: venueResolution.venueId,
            entityId: input.source.entityId,
            isRegular,
            isSeries,
            isSatellite
        });
        console.log(`[SAVE-GAME] Computed query keys:`, queryKeys);
    }

    const game = {
        id: gameId,
        name: input.game.name, gameType: input.game.gameType, gameVariant: input.game.gameVariant || 'NLHE', gameStatus: input.game.gameStatus,
        gameStartDateTime: gameStartDateTime, gameEndDateTime: input.game.gameEndDateTime ? ensureISODate(input.game.gameEndDateTime) : null,
        registrationStatus: input.game.registrationStatus || 'N_A', gameFrequency: input.game.gameFrequency || 'UNKNOWN',
        buyIn: input.game.buyIn || 0, rake: input.game.rake || 0, venueFee: effectiveVenueFee,
        hasGuarantee: input.game.hasGuarantee || false, guaranteeAmount: input.game.guaranteeAmount || 0, startingStack: input.game.startingStack || 0,
        // Simplified financials
        rakeRevenue: financials.rakeRevenue, totalBuyInsCollected: financials.totalBuyInsCollected,
        prizepoolPlayerContributions: financials.prizepoolPlayerContributions, prizepoolAddedValue: financials.prizepoolAddedValue,
        prizepoolSurplus: financials.prizepoolSurplus, guaranteeOverlayCost: financials.guaranteeOverlayCost, gameProfit: financials.gameProfit,
        // Entry counts
        totalUniquePlayers: calculateUniquePlayersFromList(input), totalInitialEntries: input.game.totalInitialEntries || 0,
        totalEntries: financials.totalEntries, 
        totalRebuys: calculateTotalRebuys(
            financials.totalEntries, 
            calculateUniquePlayersFromList(input), 
            input.game.totalRebuys, 
            input.game.consolidationType
        ), 
        totalAddons: input.game.totalAddons || 0,
        // Results
        prizepoolPaid: input.game.prizepoolPaid || 0, prizepoolCalculated: input.game.prizepoolCalculated || 0,
        playersRemaining: input.game.playersRemaining || null, totalChipsInPlay: input.game.totalChipsInPlay || null, averagePlayerStack: input.game.averagePlayerStack || null,
        // Categorization
        tournamentType: input.game.tournamentType, isSeries: isSeries, isSatellite: isSatellite, isRegular: isRegular,
        gameTags: input.game.gameTags || [], totalDuration: input.game.totalDuration || null, levels: input.game.levels || [],
        // Source
        sourceUrl: input.source.type === 'SCRAPE' ? input.source.sourceId : null, tournamentId: input.game.tournamentId, wasEdited: input.source.wasEdited || false,
        // Venue
        venueId: venueResolution.venueId, venueAssignmentStatus: venueResolution.status, suggestedVenueName: venueResolution.suggestedName || null,
        venueAssignmentConfidence: venueResolution.confidence, requiresVenueAssignment: venueResolution.venueId === UNASSIGNED_VENUE_ID,
        // Series (comprehensive)
        ...(seriesResolution.tournamentSeriesId ? { 
            tournamentSeriesId: seriesResolution.tournamentSeriesId, 
            seriesCategory: seriesResolution.seriesCategory, 
            holidayType: seriesResolution.holidayType,
            seriesTitleId: seriesResolution.seriesTitleId 
        } : {}),
        seriesName: seriesResolution.seriesName || input.game.seriesName, seriesAssignmentStatus: seriesResolution.status,
        seriesAssignmentConfidence: seriesResolution.confidence, suggestedSeriesName: seriesResolution.suggestedName,
        seriesWasAutoCreated: seriesResolution.wasCreated || false,
        isMainEvent: input.series?.isMainEvent || input.game.isMainEvent || false, eventNumber: input.series?.eventNumber || input.game.eventNumber || null,
        dayNumber: input.series?.dayNumber || input.game.dayNumber || null, flightLetter: input.series?.flightLetter || input.game.flightLetter || null,
        finalDay: input.series?.finalDay || input.game.finalDay || false,
        
        // Query optimization keys
        gameDayOfWeek: queryKeys.gameDayOfWeek,
        buyInBucket: queryKeys.buyInBucket,
        venueScheduleKey: queryKeys.venueScheduleKey,
        entityQueryKey: queryKeys.entityQueryKey,
        // Game-type-aware keys (for filtered queries by game type)
        venueGameTypeKey: queryKeys.venueGameTypeKey,
        entityGameTypeKey: queryKeys.entityGameTypeKey,
        
        // Entity & timestamps
        entityId: input.source.entityId, createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: timestamp, __typename: 'Game'
    };

    if (input.auditTrail) {
        const auditInfo = parseAuditTrail(input.auditTrail);
        if (auditInfo) { game.lastEditedAt = auditInfo.editedAt; game.lastEditedBy = auditInfo.editedBy; game.editHistory = JSON.stringify([auditInfo]); }
    }

    await monitoredDdbDocClient.send(new PutCommand({ TableName: getTableName('Game'), Item: game }));
    console.log(`[SAVE-GAME] ✅ Created game: ${gameId}${input.source.wasEdited ? ' (with edits)' : ''}`);

    // Log if series was auto-created
    if (seriesResolution.wasCreated) {
        console.log(`[SAVE-GAME] 📦 Auto-created series: ${seriesResolution.seriesName} (${seriesResolution.tournamentSeriesId})`);
    }

    await createOrUpdateGameCost(gameId, venueResolution.venueId, input.source.entityId, game.gameStartDateTime, game.totalInitialEntries || 0, game.totalEntries || 0);
    await createOrUpdateGameFinancialSnapshot(game, input.source.entityId, venueResolution.venueId);

    return { gameId, game, wasNewGame: true, fieldsUpdated: [], seriesWasCreated: seriesResolution.wasCreated || false };
};

// ===================================================================
// UPDATE GAME (WITH QUERY KEYS)
// ===================================================================

const updateGame = async (existingGame, input, venueResolution, seriesResolution) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const fieldsUpdated = [];

    monitoring.trackOperation('UPDATE', 'Game', existingGame.id, { entityId: input.source.entityId, tournamentId: input.game.tournamentId, wasEdited: input.source.wasEdited, venueFee: venueResolution.venueFee });

    const effectiveVenueFee = input.game.venueFee ?? venueResolution.venueFee ?? 0;
    const financials = calculateFinancials(input.game, effectiveVenueFee);
    const updateFields = {};

    const checkAndUpdate = (field, newValue, existingValue) => {
        if (newValue !== undefined && newValue !== null && newValue !== existingValue) { updateFields[field] = newValue; fieldsUpdated.push(field); }
    };

    checkAndUpdate('name', input.game.name, existingGame.name);
    checkAndUpdate('gameStatus', input.game.gameStatus, existingGame.gameStatus);
    checkAndUpdate('registrationStatus', input.game.registrationStatus, existingGame.registrationStatus);
    checkAndUpdate('buyIn', input.game.buyIn, existingGame.buyIn);
    checkAndUpdate('rake', input.game.rake, existingGame.rake);
    checkAndUpdate('hasGuarantee', input.game.hasGuarantee, existingGame.hasGuarantee);
    checkAndUpdate('guaranteeAmount', input.game.guaranteeAmount, existingGame.guaranteeAmount);
    checkAndUpdate('startingStack', input.game.startingStack, existingGame.startingStack);
    checkAndUpdate('gameVariant', input.game.gameVariant, existingGame.gameVariant);
    if (effectiveVenueFee !== existingGame.venueFee) { updateFields.venueFee = effectiveVenueFee; fieldsUpdated.push('venueFee'); }

    // Simplified financials
    checkAndUpdate('rakeRevenue', financials.rakeRevenue, existingGame.rakeRevenue);
    checkAndUpdate('totalBuyInsCollected', financials.totalBuyInsCollected, existingGame.totalBuyInsCollected);
    checkAndUpdate('prizepoolPlayerContributions', financials.prizepoolPlayerContributions, existingGame.prizepoolPlayerContributions);
    checkAndUpdate('prizepoolAddedValue', financials.prizepoolAddedValue, existingGame.prizepoolAddedValue);
    checkAndUpdate('prizepoolSurplus', financials.prizepoolSurplus, existingGame.prizepoolSurplus);
    checkAndUpdate('guaranteeOverlayCost', financials.guaranteeOverlayCost, existingGame.guaranteeOverlayCost);
    checkAndUpdate('gameProfit', financials.gameProfit, existingGame.gameProfit);

    // Entry counts
    const calculatedUniquePlayers = calculateUniquePlayersFromList(input);
    checkAndUpdate('totalUniquePlayers', calculatedUniquePlayers, existingGame.totalUniquePlayers);
    checkAndUpdate('totalInitialEntries', input.game.totalInitialEntries, existingGame.totalInitialEntries);
    checkAndUpdate('totalEntries', financials.totalEntries, existingGame.totalEntries);
    
    // Calculate totalRebuys from entry data
    const effectiveTotalEntries = financials.totalEntries || existingGame.totalEntries || 0;
    const effectiveUniquePlayers = calculatedUniquePlayers || existingGame.totalUniquePlayers || 0;
    const calculatedRebuys = calculateTotalRebuys(
        effectiveTotalEntries, 
        effectiveUniquePlayers, 
        input.game.totalRebuys, 
        input.game.consolidationType || existingGame.consolidationType
    );
    checkAndUpdate('totalRebuys', calculatedRebuys, existingGame.totalRebuys);
    checkAndUpdate('totalAddons', input.game.totalAddons, existingGame.totalAddons);

    checkAndUpdate('prizepoolPaid', input.game.prizepoolPaid, existingGame.prizepoolPaid);
    checkAndUpdate('prizepoolCalculated', input.game.prizepoolCalculated, existingGame.prizepoolCalculated);
    checkAndUpdate('playersRemaining', input.game.playersRemaining, existingGame.playersRemaining);
    checkAndUpdate('totalChipsInPlay', input.game.totalChipsInPlay, existingGame.totalChipsInPlay);
    checkAndUpdate('averagePlayerStack', input.game.averagePlayerStack, existingGame.averagePlayerStack);
    checkAndUpdate('totalDuration', input.game.totalDuration, existingGame.totalDuration);
    checkAndUpdate('isRegular', input.game.isRegular, existingGame.isRegular);
    checkAndUpdate('isSeries', input.game.isSeries, existingGame.isSeries);
    checkAndUpdate('isSatellite', input.game.isSatellite, existingGame.isSatellite);
    if (input.game.levels) checkAndUpdate('levels', input.game.levels, existingGame.levels);
    if (input.game.gameEndDateTime) checkAndUpdate('gameEndDateTime', ensureISODate(input.game.gameEndDateTime), existingGame.gameEndDateTime);

    // Venue
    if (venueResolution.confidence > (existingGame.venueAssignmentConfidence || 0) || venueResolution.status === 'MANUALLY_ASSIGNED') {
        checkAndUpdate('venueId', venueResolution.venueId, existingGame.venueId);
        checkAndUpdate('venueAssignmentStatus', venueResolution.status, existingGame.venueAssignmentStatus);
        checkAndUpdate('venueAssignmentConfidence', venueResolution.confidence, existingGame.venueAssignmentConfidence);
        checkAndUpdate('requiresVenueAssignment', venueResolution.venueId === UNASSIGNED_VENUE_ID, existingGame.requiresVenueAssignment);
        if (venueResolution.suggestedName) checkAndUpdate('suggestedVenueName', venueResolution.suggestedName, existingGame.suggestedVenueName);
    }

    // Series
    if (seriesResolution.confidence > (existingGame.seriesAssignmentConfidence || 0) || seriesResolution.status === 'MANUALLY_ASSIGNED' || seriesResolution.status === 'AUTO_CREATED') {
        checkAndUpdate('tournamentSeriesId', seriesResolution.tournamentSeriesId, existingGame.tournamentSeriesId);
        checkAndUpdate('seriesName', seriesResolution.seriesName, existingGame.seriesName);
        checkAndUpdate('seriesCategory', seriesResolution.seriesCategory, existingGame.seriesCategory);
        checkAndUpdate('holidayType', seriesResolution.holidayType, existingGame.holidayType);
        checkAndUpdate('seriesAssignmentStatus', seriesResolution.status, existingGame.seriesAssignmentStatus);
        checkAndUpdate('seriesAssignmentConfidence', seriesResolution.confidence, existingGame.seriesAssignmentConfidence);
        if (seriesResolution.seriesTitleId) checkAndUpdate('seriesTitleId', seriesResolution.seriesTitleId, existingGame.seriesTitleId);
        if (seriesResolution.wasCreated) checkAndUpdate('seriesWasAutoCreated', true, existingGame.seriesWasAutoCreated);
        if (seriesResolution.suggestedName) checkAndUpdate('suggestedSeriesName', seriesResolution.suggestedName, existingGame.suggestedSeriesName);
    }

    checkAndUpdate('isMainEvent', input.series?.isMainEvent || input.game.isMainEvent, existingGame.isMainEvent);
    checkAndUpdate('eventNumber', input.series?.eventNumber || input.game.eventNumber, existingGame.eventNumber);
    checkAndUpdate('dayNumber', input.series?.dayNumber || input.game.dayNumber, existingGame.dayNumber);
    checkAndUpdate('flightLetter', input.series?.flightLetter || input.game.flightLetter, existingGame.flightLetter);
    checkAndUpdate('finalDay', input.series?.finalDay || input.game.finalDay, existingGame.finalDay);

    // Determine current game type flags
    const currentIsRegular = updateFields.isRegular ?? existingGame.isRegular ?? false;
    const currentIsSeries = updateFields.isSeries ?? existingGame.isSeries ?? false;
    const currentIsSatellite = updateFields.isSatellite ?? existingGame.isSatellite ?? false;
    
    // MODIFIED: Determine effective status to check for NOT_PUBLISHED
    const effectiveGameStatus = updateFields.gameStatus || existingGame.gameStatus;

    // Check if query keys are missing (legacy records) or need recomputation
    const queryKeysMissing = !existingGame.venueScheduleKey || !existingGame.entityQueryKey || 
                             !existingGame.gameDayOfWeek || !existingGame.buyInBucket;
    const gameTypeKeysMissing = !existingGame.venueGameTypeKey || !existingGame.entityGameTypeKey;
    
    // LOGIC CHANGE START
    if (effectiveGameStatus === 'NOT_PUBLISHED') {
        // If game is NOT_PUBLISHED, ensure all query keys are NULL
        const keysToClear = [
            'gameDayOfWeek', 'buyInBucket', 'venueScheduleKey', 'entityQueryKey',
            'venueGameTypeKey', 'entityGameTypeKey'
        ];
        
        let keysCleared = false;
        keysToClear.forEach(key => {
            // Only update if it's not already null
            if (existingGame[key] !== null) {
                updateFields[key] = null;
                fieldsUpdated.push(key);
                keysCleared = true;
            }
        });
        
        if (keysCleared) {
            console.log(`[SAVE-GAME] Cleared query optimization keys for NOT_PUBLISHED game`);
        }
    } 
    // Recompute query keys if relevant fields changed OR if keys are missing (ONLY if not NOT_PUBLISHED)
    else if (shouldRecomputeQueryKeys(fieldsUpdated) || queryKeysMissing || gameTypeKeysMissing) {
        // ... (existing recomputation logic goes here) ...
        const reason = queryKeysMissing ? 'missing query keys (legacy record)' : 
            gameTypeKeysMissing ? 'missing game type keys' :
            `changes in: ${fieldsUpdated.filter(f => ['gameStartDateTime', 'buyIn', 'gameVariant', 'venueId', 'entityId', 'isRegular', 'isSeries', 'isSatellite'].includes(f)).join(', ')}`;
        console.log(`[SAVE-GAME] Computing query keys - ${reason}`);
        
        const queryKeys = computeGameQueryKeys({
            gameStartDateTime: updateFields.gameStartDateTime || existingGame.gameStartDateTime,
            buyIn: updateFields.buyIn ?? existingGame.buyIn ?? 0,
            gameVariant: updateFields.gameVariant || existingGame.gameVariant || 'NLHE',
            venueId: updateFields.venueId || existingGame.venueId,
            entityId: input.source.entityId || existingGame.entityId,
            isRegular: currentIsRegular,
            isSeries: currentIsSeries,
            isSatellite: currentIsSatellite
        });

        console.log(`[SAVE-GAME] Computed query keys:`, queryKeys);

        if (queryKeys.gameDayOfWeek !== existingGame.gameDayOfWeek) {
            updateFields.gameDayOfWeek = queryKeys.gameDayOfWeek;
            fieldsUpdated.push('gameDayOfWeek');
        }
        if (queryKeys.buyInBucket !== existingGame.buyInBucket) {
            updateFields.buyInBucket = queryKeys.buyInBucket;
            fieldsUpdated.push('buyInBucket');
        }
        if (queryKeys.venueScheduleKey !== existingGame.venueScheduleKey) {
            updateFields.venueScheduleKey = queryKeys.venueScheduleKey;
            fieldsUpdated.push('venueScheduleKey');
        }
        if (queryKeys.entityQueryKey !== existingGame.entityQueryKey) {
            updateFields.entityQueryKey = queryKeys.entityQueryKey;
            fieldsUpdated.push('entityQueryKey');
        }
        
        // Game-type-aware keys
        if (queryKeys.venueGameTypeKey !== existingGame.venueGameTypeKey) {
            updateFields.venueGameTypeKey = queryKeys.venueGameTypeKey;
            fieldsUpdated.push('venueGameTypeKey');
        }
        if (queryKeys.entityGameTypeKey !== existingGame.entityGameTypeKey) {
            updateFields.entityGameTypeKey = queryKeys.entityGameTypeKey;
            fieldsUpdated.push('entityGameTypeKey');
        }
    }
    // LOGIC CHANGE END

    if (input.source.wasEdited) {
        updateFields.wasEdited = true;
        if (input.auditTrail) {
            const auditInfo = parseAuditTrail(input.auditTrail);
            if (auditInfo) {
                updateFields.lastEditedAt = auditInfo.editedAt;
                updateFields.lastEditedBy = auditInfo.editedBy;
                let editHistory = [];
                try { if (existingGame.editHistory) editHistory = JSON.parse(existingGame.editHistory); } catch (e) {}
                editHistory.push(auditInfo);
                if (editHistory.length > 10) editHistory = editHistory.slice(-10);
                updateFields.editHistory = JSON.stringify(editHistory);
            }
        }
    }

    updateFields.updatedAt = now;
    updateFields._lastChangedAt = timestamp;

    if (Object.keys(updateFields).length > 2) {
        const updateExpression = 'SET ' + Object.keys(updateFields).map(key => `#${key} = :${key}`).join(', ');
        const expressionAttributeNames = Object.fromEntries(Object.keys(updateFields).map(k => [`#${k}`, k]));
        const expressionAttributeValues = Object.fromEntries(Object.keys(updateFields).map(k => [`:${k}`, updateFields[k]]));

        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: getTableName('Game'),
            Key: { id: existingGame.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));

        console.log(`[SAVE-GAME] ✅ Updated game ${existingGame.id}, fields: ${fieldsUpdated.join(', ')}${input.source.wasEdited ? ' (edited data)' : ''}`);
    } else {
        console.log(`[SAVE-GAME] No changes detected for game ${existingGame.id}`);
    }

    const updatedGame = { ...existingGame, ...updateFields };
    await createOrUpdateGameCost(updatedGame.id, venueResolution.venueId, input.source.entityId, updatedGame.gameStartDateTime, updatedGame.totalInitialEntries || 0, updatedGame.totalEntries || 0);
    await createOrUpdateGameFinancialSnapshot(updatedGame, input.source.entityId, venueResolution.venueId);

    return { gameId: updatedGame.id, game: updatedGame, wasNewGame: false, fieldsUpdated, seriesWasCreated: seriesResolution.wasCreated || false };
};

// ===================================================================
// SCRAPE TRACKING
// ===================================================================

const updateScrapeURL = async (sourceUrl, gameId, gameStatus, doNotScrape = false, wasEdited = false) => {
    if (!sourceUrl) return;
    const now = new Date().toISOString();
    monitoring.trackOperation('UPDATE', 'ScrapeURL', sourceUrl);

    try {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: getTableName('ScrapeURL'),
            Key: { id: sourceUrl },
            UpdateExpression: 'SET gameId = :gameId, gameStatus = :gameStatus, lastScrapeStatus = :status, lastScrapedAt = :now, doNotScrape = :dns, wasEdited = :wasEdited, updatedAt = :now',
            ExpressionAttributeValues: { ':gameId': gameId, ':gameStatus': gameStatus, ':status': doNotScrape ? 'SKIPPED_DONOTSCRAPE' : (wasEdited ? 'SUCCESS_EDITED' : 'SUCCESS'), ':now': now, ':dns': doNotScrape, ':wasEdited': wasEdited }
        }));
        console.log(`[SAVE-GAME] Updated ScrapeURL: ${sourceUrl}`);
    } catch (error) {
        console.error(`[SAVE-GAME] Error updating ScrapeURL:`, error);
    }
};

const createScrapeAttempt = async (input, gameId, wasNewGame, fieldsUpdated) => {
    const attemptId = uuidv4();
    const now = new Date().toISOString();
    monitoring.trackOperation('INSERT', 'ScrapeAttempt', attemptId);

    let status = wasNewGame ? 'SAVED' : fieldsUpdated.length > 0 ? 'UPDATED' : 'NO_CHANGES';
    if (input.source.wasEdited) status = status + '_EDITED';

    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: getTableName('ScrapeAttempt'),
            Item: {
                id: attemptId, url: input.source.sourceId, scrapedAt: input.source.fetchedAt || now, status,
                gameStatus: input.game.gameStatus, fieldsExtracted: Object.keys(input.game).filter(k => input.game[k] !== null && input.game[k] !== undefined),
                fieldsUpdated, wasNewGame, wasEdited: input.source.wasEdited || false, gameId, entityId: input.source.entityId,
                contentHash: input.source.contentHash, createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: Date.now(), __typename: 'ScrapeAttempt'
            }
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

const shouldQueueForPDP = (input, game) => {
    if (!PLAYER_PROCESSOR_QUEUE_URL) return { shouldQueue: false, reason: 'QUEUE_NOT_CONFIGURED' };
    if (!input.players || !input.players.allPlayers || input.players.allPlayers.length === 0) return { shouldQueue: false, reason: 'NO_PLAYER_DATA' };
    if (input.options?.skipPlayerProcessing) return { shouldQueue: false, reason: 'EXPLICITLY_SKIPPED' };

    const gameStatus = game.gameStatus || input.game.gameStatus;
    if (FINISHED_STATUSES.includes(gameStatus)) {
        return (input.players.hasCompleteResults || input.players.allPlayers.some(p => p.rank))
            ? { shouldQueue: true, reason: 'FINISHED_WITH_RESULTS' }
            : { shouldQueue: false, reason: 'FINISHED_NO_RESULTS' };
    }
    if (LIVE_STATUSES.includes(gameStatus)) return { shouldQueue: false, reason: 'LIVE_GAME', updateEntriesOnly: true };
    if (SCHEDULED_STATUSES.includes(gameStatus)) return { shouldQueue: false, reason: 'SCHEDULED_GAME' };
    if (INACTIVE_STATUSES.includes(gameStatus)) return { shouldQueue: false, reason: 'INACTIVE_GAME' };
    return { shouldQueue: false, reason: 'UNKNOWN_STATUS' };
};

/**
 * Queue game for Player Data Processor with BATCHED player messages
 * 
 * Splits players into batches of PLAYER_BATCH_SIZE to prevent Lambda timeouts.
 * Each batch is sent as a separate SQS message for parallel processing.
 */
const PLAYER_BATCH_SIZE = 25;

const queueForPDP = async (game, input) => {
    const allPlayers = input.players.allPlayers || [];
    
    if (allPlayers.length === 0) {
        console.log(`[SAVE-GAME] No players to queue for game ${game.id}`);
        return true;
    }
    
    // Split players into batches
    const batches = [];
    for (let i = 0; i < allPlayers.length; i += PLAYER_BATCH_SIZE) {
        batches.push(allPlayers.slice(i, i + PLAYER_BATCH_SIZE));
    }
    
    console.log(`[SAVE-GAME] Splitting ${allPlayers.length} players into ${batches.length} batches for game ${game.id}`);
    
    monitoring.trackOperation('QUEUE_PDP', 'SQS', game.id, {
        totalPlayers: allPlayers.length,
        batchCount: batches.length,
        batchSize: PLAYER_BATCH_SIZE
    });

    const gamePayload = {
        id: game.id, name: game.name, gameType: game.gameType, gameVariant: game.gameVariant, gameStatus: game.gameStatus,
        gameStartDateTime: game.gameStartDateTime, gameEndDateTime: game.gameEndDateTime,
        buyIn: game.buyIn, rake: game.rake, prizepoolPaid: game.prizepoolPaid, prizepoolCalculated: game.prizepoolCalculated,
        totalUniquePlayers: game.totalUniquePlayers, totalInitialEntries: game.totalInitialEntries, totalEntries: game.totalEntries,
        totalRebuys: game.totalRebuys, totalAddons: game.totalAddons,
        venueId: game.venueId, entityId: game.entityId, isSeries: game.isSeries, seriesName: game.seriesName,
        tournamentSeriesId: game.tournamentSeriesId, isSatellite: game.isSatellite, gameFrequency: game.gameFrequency, wasEdited: game.wasEdited || false
    };

    const sendPromises = batches.map(async (batchPlayers, batchIndex) => {
        const message = {
            game: gamePayload,
            players: {
                allPlayers: batchPlayers,
                totalUniquePlayers: input.players.totalUniquePlayers,
                hasCompleteResults: input.players.hasCompleteResults,
                totalPrizesPaid: input.players.totalPrizesPaid || 0
            },
            metadata: {
                processedAt: new Date().toISOString(),
                sourceUrl: input.source.sourceId,
                venueId: game.venueId,
                entityId: game.entityId,
                hasCompleteResults: input.players.hasCompleteResults,
                totalPlayersProcessed: batchPlayers.length,
                totalPrizesPaid: input.players.totalPrizesPaid || 0,
                wasEdited: input.source.wasEdited || false,
                batchIndex: batchIndex,
                batchCount: batches.length,
                totalPlayersInGame: allPlayers.length
            }
        };

        try {
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: PLAYER_PROCESSOR_QUEUE_URL,
                MessageBody: JSON.stringify(message),
                MessageGroupId: String(input.game.tournamentId || game.id),
                MessageDeduplicationId: `${game.id}-batch${batchIndex}-${Date.now()}`
            }));
            return { success: true, batchIndex };
        } catch (error) {
            console.error(`[SAVE-GAME] Error queueing batch ${batchIndex} for game ${game.id}:`, error);
            return { success: false, batchIndex, error: error.message };
        }
    });

    const results = await Promise.all(sendPromises);
    
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
        console.error(`[SAVE-GAME] Failed to queue ${failed.length}/${batches.length} batches for game ${game.id}`);
        throw new Error(`Failed to queue ${failed.length} player batches`);
    }
    
    console.log(`[SAVE-GAME] Queued game ${game.id} for PDP (${allPlayers.length} players in ${batches.length} batches)`);
    return true;
};

const updatePlayerEntries = async (game, input) => {
    if (!input.players || !input.players.allPlayers) return;
    const playerEntryTable = getTableName('PlayerEntry');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const crypto = require('crypto');

    monitoring.trackOperation('BATCH_WRITE', 'PlayerEntry', game.id, { count: input.players.allPlayers.length });

    const entries = input.players.allPlayers.map(player => {
        const normalized = player.name.toLowerCase().trim();
        const playerId = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
        const entryId = `${playerId}#${game.id}`;
        return {
            PutRequest: {
                Item: {
                    id: entryId, playerId, gameId: game.id, venueId: game.venueId, entityId: game.entityId, status: 'PLAYING',
                    registrationTime: now, gameStartDateTime: game.gameStartDateTime,
                    createdAt: now, updatedAt: now, _version: 1, _lastChangedAt: timestamp, __typename: 'PlayerEntry'
                }
            }
        };
    });

    const chunks = [];
    for (let i = 0; i < entries.length; i += 25) chunks.push(entries.slice(i, i + 25));

    for (const chunk of chunks) {
        try { await monitoredDdbDocClient.send(new BatchWriteCommand({ RequestItems: { [playerEntryTable]: chunk } })); }
        catch (error) { console.error(`[SAVE-GAME] Error batch writing entries:`, error); }
    }
    console.log(`[SAVE-GAME] Updated player entries for live game ${game.id}`);
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[SAVE-GAME] Lambda invoked');
    console.log('[SAVE-GAME] Event:', JSON.stringify(event, null, 2));

    const input = event.arguments?.input || event.input || event;
    if (input.source?.entityId) monitoring.entityId = input.source.entityId;
    monitoring.trackOperation('HANDLER_START', 'Handler', 'saveGame', { entityId: input.source?.entityId, wasEdited: input.source?.wasEdited });

    try {
        const validation = validateInput(input);
        if (!validation.valid) {
            console.error('[SAVE-GAME] Validation failed:', validation.errors);
            return { success: false, action: 'VALIDATION_FAILED', message: validation.errors.join('; '), warnings: validation.warnings };
        }

        if (input.options?.validateOnly) {
            return { success: true, action: 'VALIDATED', message: 'Input validation passed', warnings: validation.warnings };
        }

        // FIX: Pass input.game.venueAssignmentStatus as the 3rd argument
        const venueResolution = await resolveVenue(
            input.venue, 
            input.source.entityId, 
            input.game.venueAssignmentStatus
        );
        console.log(`[SAVE-GAME] Venue resolved:`, venueResolution);

        // Series resolution - now with comprehensive matching and auto-creation
        const seriesResolution = input.game.isSeries && input.series
            ? await resolveSeries(input.series, input.source.entityId, input.game.gameStartDateTime, venueResolution.venueId)
            : { tournamentSeriesId: null, seriesName: null, seriesCategory: null, holidayType: null, status: 'NOT_SERIES', confidence: 0, wasCreated: false };
        
        console.log(`[SAVE-GAME] Series resolved:`, seriesResolution);
        
        // Log if a new series was created
        if (seriesResolution.wasCreated) {
            console.log(`[SAVE-GAME] 📦 New TournamentSeries created: ${seriesResolution.seriesName} (${seriesResolution.tournamentSeriesId})`);
        }

        const existingGame = await findExistingGame(input);

        let saveResult;
        if (existingGame && !input.options?.forceUpdate) {
            const hasChanges = input.game.gameStatus !== existingGame.gameStatus ||
                               input.game.totalUniquePlayers !== existingGame.totalUniquePlayers ||
                               input.game.totalInitialEntries !== existingGame.totalInitialEntries ||
                               input.game.totalEntries !== existingGame.totalEntries ||
                               input.game.prizepoolPaid !== existingGame.prizepoolPaid ||
                               input.game.prizepoolCalculated !== existingGame.prizepoolCalculated ||
                               venueResolution.venueFee !== existingGame.venueFee ||
                               input.source.wasEdited ||
                               // Also check for series changes
                               seriesResolution.tournamentSeriesId !== existingGame.tournamentSeriesId;

            if (!hasChanges) {
                console.log(`[SAVE-GAME] Game exists with no changes, skipping`);
                saveResult = { gameId: existingGame.id, game: existingGame, wasNewGame: false, fieldsUpdated: [], seriesWasCreated: false };
            } else {
                saveResult = await updateGame(existingGame, input, venueResolution, seriesResolution);
            }
        } else if (existingGame && input.options?.forceUpdate) {
            saveResult = await updateGame(existingGame, input, venueResolution, seriesResolution);
        } else {
            saveResult = await createGame(input, venueResolution, seriesResolution);
        }

        const { gameId, game, wasNewGame, fieldsUpdated, seriesWasCreated } = saveResult;

        // Update series metadata (date range, event count)
        if (seriesResolution.tournamentSeriesId) {
            try {
                await updateSeriesDateRange(
                    monitoredDdbDocClient,
                    getTableName('TournamentSeries'),
                    seriesResolution.tournamentSeriesId,
                    game.gameStartDateTime
                );
                
                // Increment event count only for new games
                if (wasNewGame) {
                    await incrementSeriesEventCount(
                        monitoredDdbDocClient,
                        getTableName('TournamentSeries'),
                        seriesResolution.tournamentSeriesId
                    );
                }
            } catch (seriesUpdateError) {
                console.warn('[SAVE-GAME] Non-critical: Failed to update series metadata:', seriesUpdateError.message);
            }
        }

        if (input.source.type === 'SCRAPE') {
            await updateScrapeURL(input.source.sourceId, gameId, game.gameStatus, input.options?.doNotScrape, input.source.wasEdited);
            await createScrapeAttempt(input, gameId, wasNewGame, fieldsUpdated);
        }

        const pdpDecision = shouldQueueForPDP(input, game);
        let playerProcessingQueued = false;

        if (pdpDecision.shouldQueue) { await queueForPDP(game, input); playerProcessingQueued = true; }
        else if (pdpDecision.updateEntriesOnly) { await updatePlayerEntries(game, input); }

        const action = wasNewGame ? 'CREATED' : fieldsUpdated.length > 0 ? 'UPDATED' : 'SKIPPED';
        const messageDetail = input.source.wasEdited ? ' (with edited data)' : '';

        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', action, { gameId, entityId: input.source.entityId, wasEdited: input.source.wasEdited, fieldsUpdated: fieldsUpdated.length, venueFee: venueResolution.venueFee, seriesWasCreated });

        return {
            success: true, gameId, action, message: `Game ${action.toLowerCase()} successfully${messageDetail}`,
            warnings: validation.warnings, playerProcessingQueued, playerProcessingReason: pdpDecision.reason,
            venueAssignment: { venueId: venueResolution.venueId, venueName: venueResolution.venueName, venueFee: venueResolution.venueFee, status: venueResolution.status, confidence: venueResolution.confidence },
            seriesAssignment: { 
                tournamentSeriesId: seriesResolution.tournamentSeriesId, 
                seriesName: seriesResolution.seriesName, 
                seriesCategory: seriesResolution.seriesCategory, 
                holidayType: seriesResolution.holidayType, 
                status: seriesResolution.status, 
                confidence: seriesResolution.confidence,
                wasCreated: seriesWasCreated,
                seriesTitleId: seriesResolution.seriesTitleId
            },
            fieldsUpdated, wasEdited: input.source.wasEdited || false
        };

    } catch (error) {
        console.error('[SAVE-GAME] Error:', error);
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'error', { error: error.message });
        return { success: false, action: 'ERROR', message: error.message || 'Internal error' };
    } finally {
        if (monitoring) { console.log('[SAVE-GAME] Flushing monitoring metrics...'); await monitoring.flush(); console.log('[SAVE-GAME] Monitoring flush complete.'); }
    }
};