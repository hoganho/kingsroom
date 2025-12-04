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
 * SAVEGAME LAMBDA FUNCTION - COMPLETE MERGED VERSION
 * 
 * Combines ALL existing functionality with new venue fee & series enhancement features
 * 
 * Single interface for saving game data from any source:
 * - Web scraping (original and edited)
 * - API integrations
 * - Manual entry
 * - Bulk imports
 * 
 * Features (ALL PRESERVED + ENHANCED):
 * ✅ Sophisticated venue matching with aliases and confidence scoring
 * ✅ Advanced series matching by title+year+venue
 * ✅ Comprehensive scrape attempt tracking
 * ✅ Player data processing queue integration
 * ✅ Edit history tracking (last 10 edits)
 * ✅ Conditional updates based on confidence scores
 * 
 * NEW ENHANCEMENTS:
 * ✅ Venue fee tracking and GameCost integration
 * ✅ Series categorization (REGULAR, SPECIAL, CHAMPIONSHIP, etc.)
 * ✅ Holiday type detection for SPECIAL series
 * ✅ Quarter and month auto-calculation
 * ✅ Financial calculations including venue fees
 * 
 * Responsibilities:
 * 1. Validate input
 * 2. Resolve venue with sophisticated matching and fee retrieval
 * 3. Resolve tournament series with title+year matching and categorization
 * 4. Save/update game in DynamoDB with venue fee
 * 5. Create/update GameCost records
 * 6. Calculate financials including venue fee deductions
 * 7. Track scrape attempts with full metadata
 * 8. Determine if game is finished
 * 9. Queue for PDP only if finished with results
 * 10. Handle audit trails for edited data
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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
 * Get Entity by ID to retrieve defaultVenueId
 */
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

/**
 * Parse and store audit trail
 */
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
 * Extract year from date string or Date object
 */
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
 * Calculate financial metrics including venue fee impact (NEW/ENHANCED)
 */
const calculateFinancials = (game, venueFee = 0) => {
    const totalEntries = game.totalEntries || 0;
    const buyIn = game.buyIn || 0;
    const rake = game.rake || 0;
    const guaranteeAmount = game.guaranteeAmount || 0;
    const prizepool = game.prizepool || 0;
    
    // Calculate total rake collected
    const totalRake = totalEntries * rake;
    
    // Calculate revenue from buy-ins
    const revenueByBuyIns = totalEntries * buyIn;
    
    // Calculate guarantee overlay/surplus
    let guaranteeOverlay = 0;
    let guaranteeSurplus = 0;
    
    if (game.hasGuarantee && guaranteeAmount > 0) {
        if (prizepool < guaranteeAmount) {
            // Overlay - we had to add money to reach guarantee
            guaranteeOverlay = guaranteeAmount - prizepool;
        } else {
            // Surplus - prizepool exceeded guarantee
            guaranteeSurplus = prizepool - guaranteeAmount;
        }
    }
    
    // Calculate profit/loss - NEW: includes venue fee deduction
    // Profit = Rake collected - Venue fee - Overlay
    let profitLoss = totalRake - (venueFee || 0);
    
    if (guaranteeOverlay > 0) {
        profitLoss -= guaranteeOverlay;
    }
    
    console.log('[SAVE-GAME] Financial calculations:', {
        totalEntries,
        buyIn,
        rake,
        totalRake,
        revenueByBuyIns,
        venueFee,
        guaranteeOverlay,
        guaranteeSurplus,
        profitLoss
    });
    
    return {
        totalRake,
        revenueByBuyIns,
        guaranteeOverlay,
        guaranteeSurplus,
        profitLoss
    };
};

// ===================================================================
// VALIDATION
// ===================================================================

/**
 * Validate SaveGameInput - Enhanced with edit tracking
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
    
    // === Check for edited data ===
    if (input.source?.wasEdited) {
        console.log('[SAVE-GAME] Processing edited data');
        if (!input.auditTrail) {
            warnings.push('Edited data flagged but no audit trail provided');
        }
    }
    
    return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
    };
};

// ===================================================================
// VENUE RESOLUTION - ENHANCED WITH FEE RETRIEVAL
// ===================================================================

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
 * Match venue by name using aliases and confidence scoring (PRESERVED)
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
// UPDATED: resolveVenue function
// Replace the existing resolveVenue function (lines ~403-532) with this:
// ===================================================================

/**
 * Resolve venue from input - ENHANCED to include fee (defaults to 0 if not set)
 */
const resolveVenue = async (venueRef, entityId) => {
    // Fetch entity to get defaultVenueId
    const entity = await getEntityById(entityId);
    const defaultVenueId = entity?.defaultVenueId || null;
    
    console.log(`[SAVE-GAME] Entity defaultVenueId: ${defaultVenueId}`);
    
    // No venue reference provided - use default or unassigned
    if (!venueRef) {
        if (defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            console.log(`[SAVE-GAME] No venue ref - using entity default: ${defaultVenue?.name}`);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0  // ✅ FIXED: Use 0 if null
            };
        }
        return {
            venueId: UNASSIGNED_VENUE_ID,
            venueName: UNASSIGNED_VENUE_NAME,
            status: 'UNASSIGNED',
            confidence: 0,
            venueFee: 0  // ✅ FIXED: Use 0 for unassigned
        };
    }
    
    // Explicit venueId provided - use it directly
    if (venueRef.venueId) {
        const venue = await getVenueById(venueRef.venueId);
        return {
            venueId: venueRef.venueId,
            venueName: venue?.name || venueRef.venueName || 'Unknown',
            status: 'MANUALLY_ASSIGNED',
            confidence: 1.0,
            venueFee: venue?.fee ?? 0  // ✅ FIXED: Use 0 if null
        };
    }
    
    // Suggested venue from auto-detection
    if (venueRef.suggestedVenueId) {
        const venue = await getVenueById(venueRef.suggestedVenueId);
        const confidence = venueRef.confidence || 0.8;
        
        // If confidence is too low, use default venue instead
        if (confidence < 0.6 && defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            console.log(`[SAVE-GAME] Low confidence (${confidence}) - using entity default: ${defaultVenue?.name}`);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0,  // ✅ FIXED: Use 0 if null
                suggestedVenueId: venueRef.suggestedVenueId,
                suggestedVenueName: venue?.name
            };
        }
        
        return {
            venueId: venueRef.suggestedVenueId,
            venueName: venue?.name || venueRef.venueName,
            status: 'AUTO_ASSIGNED',
            confidence: confidence,
            venueFee: venue?.fee ?? 0  // ✅ FIXED: Use 0 if null
        };
    }
    
    // Try to match by name
    if (venueRef.venueName) {
        const matched = await matchVenueByName(venueRef.venueName, entityId);
        if (matched) {
            // Need to fetch full venue to get fee
            const venue = await getVenueById(matched.id);
            return {
                venueId: matched.id,
                venueName: matched.name,
                status: 'AUTO_ASSIGNED',
                confidence: matched.confidence,
                venueFee: venue?.fee ?? 0  // ✅ FIXED: Use 0 if null
            };
        }
        
        // No match found - use default venue if available, otherwise pending
        if (defaultVenueId) {
            const defaultVenue = await getVenueById(defaultVenueId);
            console.log(`[SAVE-GAME] No match for "${venueRef.venueName}" - using entity default: ${defaultVenue?.name}`);
            return {
                venueId: defaultVenueId,
                venueName: defaultVenue?.name || 'Default Venue',
                status: 'AUTO_ASSIGNED',
                confidence: 0.5,
                venueFee: defaultVenue?.fee ?? 0,  // ✅ FIXED: Use 0 if null
                suggestedName: venueRef.venueName
            };
        }
        
        // No default venue - pending assignment
        return {
            venueId: UNASSIGNED_VENUE_ID,
            venueName: UNASSIGNED_VENUE_NAME,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            suggestedName: venueRef.venueName,
            venueFee: 0  // ✅ FIXED: Use 0 for pending
        };
    }
    
    // Fallback - use default or unassigned
    if (defaultVenueId) {
        const defaultVenue = await getVenueById(defaultVenueId);
        console.log(`[SAVE-GAME] Fallback - using entity default: ${defaultVenue?.name}`);
        return {
            venueId: defaultVenueId,
            venueName: defaultVenue?.name || 'Default Venue',
            status: 'AUTO_ASSIGNED',
            confidence: 0.5,
            venueFee: defaultVenue?.fee ?? 0  // ✅ FIXED: Use 0 if null
        };
    }
    
    return {
        venueId: UNASSIGNED_VENUE_ID,
        venueName: UNASSIGNED_VENUE_NAME,
        status: 'UNASSIGNED',
        confidence: 0,
        venueFee: 0  // ✅ FIXED: Use 0 for unassigned
    };
};

// ===================================================================
// SERIES RESOLUTION - ENHANCED WITH CATEGORIZATION
// ===================================================================

/**
 * Get series by ID
 */
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
 * Match series by TournamentSeriesTitle ID, year, and optionally venue (PRESERVED + ENHANCED)
 * This is the most accurate matching method
 */
const matchSeriesByTitleAndYear = async (seriesTitleId, year, venueId = null) => {
    if (!seriesTitleId || !year) {
        return null;
    }
    
    try {
        console.log(`[SAVE-GAME] Querying TournamentSeries for titleId: ${seriesTitleId}, year: ${year}`);
        
        // Query by tournamentSeriesTitleId and year using the byTournamentSeriesTitle index
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: getTableName('TournamentSeries'),
            IndexName: 'byTournamentSeriesTitle',
            KeyConditionExpression: 'tournamentSeriesTitleId = :titleId AND #year = :year',
            ExpressionAttributeNames: {
                '#year': 'year'
            },
            ExpressionAttributeValues: {
                ':titleId': seriesTitleId,
                ':year': year
            }
        }));
        
        if (!result.Items || result.Items.length === 0) {
            console.log(`[SAVE-GAME] No TournamentSeries found for title ${seriesTitleId} in ${year}`);
            return null;
        }
        
        // If we have a venueId, prefer the series at that venue
        if (venueId && result.Items.length > 1) {
            const venueMatch = result.Items.find(s => s.venueId === venueId);
            if (venueMatch) {
                console.log(`[SAVE-GAME] Found series at matching venue: ${venueMatch.name}`);
                return {
                    id: venueMatch.id,
                    name: venueMatch.name,
                    seriesCategory: venueMatch.seriesCategory,  // NEW
                    holidayType: venueMatch.holidayType,  // NEW
                    quarter: venueMatch.quarter,  // NEW
                    month: venueMatch.month,  // NEW
                    confidence: 1.0
                };
            }
        }
        
        // Return first match (or only match)
        const series = result.Items[0];
        console.log(`[SAVE-GAME] Found series: ${series.name} (${year})`);
        
        return {
            id: series.id,
            name: series.name,
            seriesCategory: series.seriesCategory,  // NEW
            holidayType: series.holidayType,  // NEW
            quarter: series.quarter,  // NEW
            month: series.month,  // NEW
            confidence: result.Items.length === 1 ? 0.95 : 0.85
        };
        
    } catch (error) {
        console.error('[SAVE-GAME] Error matching series by title and year:', error);
        
        // If index query fails, fall back to scan
        try {
            console.log('[SAVE-GAME] Falling back to scan for series matching');
            const scanResult = await monitoredDdbDocClient.send(new ScanCommand({
                TableName: getTableName('TournamentSeries'),
                FilterExpression: 'tournamentSeriesTitleId = :titleId AND #year = :year',
                ExpressionAttributeNames: {
                    '#year': 'year'
                },
                ExpressionAttributeValues: {
                    ':titleId': seriesTitleId,
                    ':year': year
                }
            }));
            
            if (scanResult.Items && scanResult.Items.length > 0) {
                const series = scanResult.Items[0];
                return {
                    id: series.id,
                    name: series.name,
                    seriesCategory: series.seriesCategory,  // NEW
                    holidayType: series.holidayType,  // NEW
                    quarter: series.quarter,  // NEW
                    month: series.month,  // NEW
                    confidence: 0.9
                };
            }
        } catch (scanError) {
            console.error('[SAVE-GAME] Scan fallback also failed:', scanError);
        }
        
        return null;
    }
};

/**
 * Match series by name and year (PRESERVED + ENHANCED)
 * This function matches TournamentSeries based on:
 * 1. Series name (exact or contains match)
 * 2. Year must match exactly
 * 3. Entity context (if available through venue relationship)
 */
const matchSeriesByNameAndYear = async (seriesName, year, entityId) => {
    if (!seriesName || !year) {
        console.error('[SAVE-GAME] Series name and year are required for matching');
        return null;
    }
    
    const normalizedName = seriesName.toLowerCase().trim();
    
    try {
        console.log(`[SAVE-GAME] Searching for series: "${seriesName}" in year ${year}`);
        
        // First, try to get all TournamentSeries and filter
        // Note: This might need optimization with proper indexes in production
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: getTableName('TournamentSeries'),
            IndexName: 'byYear', // Assuming we have or will create this index
            KeyConditionExpression: '#year = :year',
            ExpressionAttributeNames: {
                '#year': 'year'
            },
            ExpressionAttributeValues: {
                ':year': year
            }
        }));
        
        if (!result.Items || result.Items.length === 0) {
            // Fallback: Scan with filter (less efficient but works without index)
            const scanResult = await monitoredDdbDocClient.send(new ScanCommand({
                TableName: getTableName('TournamentSeries'),
                FilterExpression: '#year = :year',
                ExpressionAttributeNames: {
                    '#year': 'year'
                },
                ExpressionAttributeValues: {
                    ':year': year
                }
            }));
            
            result.Items = scanResult.Items || [];
        }
        
        // Now filter by name
        let bestMatch = null;
        let bestConfidence = 0;
        
        for (const series of result.Items) {
            const seriesNameLower = series.name.toLowerCase().trim();
            
            // Exact match
            if (seriesNameLower === normalizedName) {
                return {
                    id: series.id,
                    name: series.name,
                    seriesCategory: series.seriesCategory,  // NEW
                    holidayType: series.holidayType,  // NEW
                    quarter: series.quarter,  // NEW
                    month: series.month,  // NEW
                    confidence: 1.0
                };
            }
            
            // Check if series name contains the search term or vice versa
            if (seriesNameLower.includes(normalizedName) || normalizedName.includes(seriesNameLower)) {
                const confidence = 0.85;
                if (confidence > bestConfidence) {
                    bestMatch = series;
                    bestConfidence = confidence;
                }
            }
            
            // Check aliases if available
            if (series.aliases && Array.isArray(series.aliases)) {
                for (const alias of series.aliases) {
                    if (alias.toLowerCase().trim() === normalizedName) {
                        return {
                            id: series.id,
                            name: series.name,
                            seriesCategory: series.seriesCategory,  // NEW
                            holidayType: series.holidayType,  // NEW
                            quarter: series.quarter,  // NEW
                            month: series.month,  // NEW
                            confidence: 0.95
                        };
                    }
                }
            }
        }
        
        if (bestMatch) {
            console.log(`[SAVE-GAME] Found series match: ${bestMatch.name} (${year}) with confidence ${bestConfidence}`);
            return {
                id: bestMatch.id,
                name: bestMatch.name,
                seriesCategory: bestMatch.seriesCategory,  // NEW
                holidayType: bestMatch.holidayType,  // NEW
                quarter: bestMatch.quarter,  // NEW
                month: bestMatch.month,  // NEW
                confidence: bestConfidence
            };
        }
        
        console.log(`[SAVE-GAME] No series found matching "${seriesName}" in year ${year}`);
        return null;
        
    } catch (error) {
        console.error('[SAVE-GAME] Error matching series by name and year:', error);
        return null;
    }
};

/**
 * Resolve tournament series from input (PRESERVED + ENHANCED)
 * Priority:
 * 1. Explicit seriesId (manual assignment)
 * 2. Match by seriesTitleId + year + venueId
 * 3. Match by seriesName + year
 * 
 * @param {Object} seriesRef - Series reference from input
 * @param {string} entityId - Entity ID for context
 * @param {string} gameStartDateTime - Game start date to extract year from
 * @param {string} venueId - Resolved venue ID for better matching
 */
const resolveSeries = async (seriesRef, entityId, gameStartDateTime, venueId = null) => {
    // No series reference or not a series game
    if (!seriesRef || !seriesRef.seriesName) {
        return {
            tournamentSeriesId: null,
            seriesName: null,
            seriesCategory: null,  // NEW
            holidayType: null,  // NEW
            quarter: null,  // NEW
            month: null,  // NEW
            status: 'NOT_SERIES',
            confidence: 0
        };
    }
    
    // Explicit seriesId provided - use it directly (manual assignment from dropdown)
    if (seriesRef.seriesId) {
        const series = await getSeriesById(seriesRef.seriesId);
        if (series) {
            return {
                tournamentSeriesId: seriesRef.seriesId,
                seriesName: series.name,
                seriesCategory: series.seriesCategory,  // NEW
                holidayType: series.holidayType,  // NEW
                quarter: series.quarter,  // NEW
                month: series.month,  // NEW
                status: 'MANUALLY_ASSIGNED',
                confidence: 1.0
            };
        }
        // If series not found, fall through to other matching
        console.warn(`[SAVE-GAME] Provided seriesId ${seriesRef.seriesId} not found, falling back to name matching`);
    }
    
    // Extract year from gameStartDateTime if not provided in seriesRef
    const year = seriesRef.year || extractYearFromDate(gameStartDateTime);
    
    if (!year) {
        console.warn('[SAVE-GAME] Could not determine year for series matching');
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: null,  // NEW
            holidayType: null,  // NEW
            quarter: null,  // NEW
            month: null,  // NEW
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            suggestedName: seriesRef.seriesName
        };
    }
    
    // Try to match by seriesTitleId + year + venueId (most accurate)
    if (seriesRef.seriesTitleId) {
        console.log(`[SAVE-GAME] Matching series by titleId: ${seriesRef.seriesTitleId}, year: ${year}, venue: ${venueId}`);
        const matched = await matchSeriesByTitleAndYear(
            seriesRef.seriesTitleId,
            year,
            venueId
        );
        if (matched) {
            return {
                tournamentSeriesId: matched.id,
                seriesName: matched.name,
                seriesCategory: matched.seriesCategory,  // NEW
                holidayType: matched.holidayType,  // NEW
                quarter: matched.quarter,  // NEW
                month: matched.month,  // NEW
                status: 'AUTO_ASSIGNED',
                confidence: matched.confidence
            };
        }
    }
    
    // Try to match by seriesName + year
    if (seriesRef.seriesName) {
        console.log(`[SAVE-GAME] Matching series by name: "${seriesRef.seriesName}", year: ${year}`);
        const matched = await matchSeriesByNameAndYear(
            seriesRef.seriesName, 
            year, 
            entityId
        );
        if (matched) {
            return {
                tournamentSeriesId: matched.id,
                seriesName: matched.name,
                seriesCategory: matched.seriesCategory,  // NEW
                holidayType: matched.holidayType,  // NEW
                quarter: matched.quarter,  // NEW
                month: matched.month,  // NEW
                status: 'AUTO_ASSIGNED',
                confidence: matched.confidence
            };
        }
        
        // No match found - game is series but not linked
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: null,  // NEW
            holidayType: null,  // NEW
            quarter: null,  // NEW
            month: null,  // NEW
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            suggestedName: seriesRef.seriesName,
            year: year
        };
    }
    
    // Series game but no series identified
    return {
        tournamentSeriesId: null,
        seriesName: seriesRef.seriesName || 'Unknown Series',
        seriesCategory: null,  // NEW
        holidayType: null,  // NEW
        quarter: null,  // NEW
        month: null,  // NEW
        status: 'UNASSIGNED',
        confidence: 0
    };
};

// ===================================================================
// GAME OPERATIONS
// ===================================================================

/**
 * Find existing game by various criteria (PRESERVED)
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
 * Get GameCost row for a given gameId
 */
const getGameCostByGameId = async (gameId) => {
    const gameCostTable = getTableName('GameCost');

    try {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameCostTable,
            IndexName: 'byGameCost',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: {
                ':gameId': gameId
            }
        }));

        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
        console.error('[SAVE-GAME] Error fetching GameCost by gameId:', error);
        return null;
    }
};

/**
 * Create or update GameFinancialSnapshot for a game
 * Uses Game + GameCost to build a management finance view.
 */
const createOrUpdateGameFinancialSnapshot = async (game, entityId, venueId) => {
    const snapshotTable = getTableName('GameFinancialSnapshot');

    // Fetch cost record
    const gameCost = await getGameCostByGameId(game.id);
    const totalCost = gameCost?.totalCost || 0;

    // Revenue side
    const totalRake = game.totalRake || 0;
    const totalPrizePool = game.prizepool || 0;
    const totalRevenue = totalRake; // For now treat rake as revenue

    // Derived metrics
    const profit = (typeof game.profitLoss === 'number')
        ? game.profitLoss
        : (totalRevenue - totalCost);

    const profitMargin = totalRevenue > 0 ? profit / totalRevenue : null;
    const revenuePerPlayer = game.totalEntries ? totalRevenue / game.totalEntries : null;
    const costPerPlayer = game.totalEntries ? totalCost / game.totalEntries : null;

    const now = new Date().toISOString();
    const timestamp = Date.now();

    // See if a snapshot already exists for this game
    let existingSnapshot = null;
    try {
        const existingResult = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: snapshotTable,
            IndexName: 'byGameFinancialSnapshot',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: {
                ':gameId': game.id
            }
        }));
        existingSnapshot = (existingResult.Items && existingResult.Items[0]) || null;
    } catch (error) {
        console.error('[SAVE-GAME] Error querying GameFinancialSnapshot:', error);
    }

    if (existingSnapshot) {
        // UPDATE existing snapshot
        const snapshotId = existingSnapshot.id;
        monitoring.trackOperation('UPDATE', 'GameFinancialSnapshot', snapshotId);

        const updateFields = {
            // Core
            entityId,
            venueId,
            gameStartDateTime: game.gameStartDateTime,

            // Revenue/Cost
            totalRevenue,
            totalPrizePool,
            totalRake,
            totalCost,

            // Derived
            profit,
            profitMargin,
            revenuePerPlayer,
            costPerPlayer,

            // Basic denorm for future metrics
            totalDealerCost: gameCost?.totalDealerCost || 0,
            totalPromotionCost: gameCost?.totalPromotionCost || 0,
            totalFloorStaffCost: gameCost?.totalFloorStaffCost || 0,
            totalOtherCost: gameCost?.totalOtherCost || 0,

            updatedAt: now,
            _lastChangedAt: timestamp
        };

        const updateExpression = 'SET ' + Object.keys(updateFields)
            .map(key => `#${key} = :${key}`)
            .join(', ');

        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        Object.keys(updateFields).forEach((key) => {
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = updateFields[key];
        });

        try {
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: snapshotTable,
                Key: { id: snapshotId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
            console.log(`[SAVE-GAME] ✅ Updated GameFinancialSnapshot ${snapshotId} for game ${game.id}`);
        } catch (error) {
            console.error('[SAVE-GAME] Error updating GameFinancialSnapshot:', error);
        }

        return snapshotId;
    }

    // CREATE new snapshot
    const snapshotId = uuidv4();
    monitoring.trackOperation('CREATE', 'GameFinancialSnapshot', snapshotId);

    const snapshot = {
        id: snapshotId,

        // Relationships
        gameId: game.id,
        entityId,
        venueId,
        gameStartDateTime: game.gameStartDateTime,

        // Revenue & Cost
        totalRevenue,
        totalPrizePool,
        totalRake,
        totalCost,

        // Derived management metrics
        profit,
        profitMargin,
        revenuePerPlayer,
        costPerPlayer,
        totalDealerCost: gameCost?.totalDealerCost || 0,
        totalPromotionCost: gameCost?.totalPromotionCost || 0,
        totalFloorStaffCost: gameCost?.totalFloorStaffCost || 0,
        totalOtherCost: gameCost?.totalOtherCost || 0,

        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'GameFinancialSnapshot'
    };

    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: snapshotTable,
            Item: snapshot
        }));
        console.log(`[SAVE-GAME] ✅ Created GameFinancialSnapshot ${snapshotId} for game ${game.id}`);
        return snapshotId;
    } catch (error) {
        console.error('[SAVE-GAME] Error creating GameFinancialSnapshot:', error);
        return null;
    }
};

/**
 * Create or update GameCost record for a game (NEW)
 */
const createOrUpdateGameCost = async (
        gameId,
        venueId,
        entityId,
        gameStartDateTime,
        venueFee = null,
        totalEntries = 0
    ) => {
        const gameCostTable = getTableName('GameCost');
    
    // Check if GameCost already exists for this game
    try {
        const existingResult = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameCostTable,
            IndexName: 'byGameCost', // CORRECTED: Changed from 'byGame' to 'byGameCost'
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: {
                ':gameId': gameId
            }
        }));
        
        if (existingResult.Items && existingResult.Items.length > 0) {
            // Update existing GameCost
            const existingCost = existingResult.Items[0];
            const now = new Date().toISOString();
            const timestamp = Date.now();
            
            const updateFields = {};
            
            // Update venue fee if provided and different
            if (venueFee !== null && venueFee !== existingCost.venueFee) {
                updateFields.venueFee = venueFee;
            }
            
            // Recalculate total cost
            const totalCost = (updateFields.venueFee !== undefined ? updateFields.venueFee : existingCost.venueFee || 0) +
                            (existingCost.totalDealerCost || 0) +
                            (existingCost.totalTournamentDirectorCost || 0) +
                            (existingCost.totalPrizeContribution || 0) +
                            (existingCost.totalJackpotContribution || 0) +
                            (existingCost.totalPromotionCost || 0) +
                            (existingCost.totalFloorStaffCost || 0) +
                            (existingCost.totalOtherCost || 0);
            
            updateFields.totalCost = totalCost;
            updateFields.updatedAt = now;
            updateFields._lastChangedAt = timestamp;
            updateFields._version = (existingCost._version || 1) + 1;
            
            if (Object.keys(updateFields).length > 3) { // More than just updatedAt, _lastChangedAt, _version
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: gameCostTable,
                    Key: { id: existingCost.id },
                    UpdateExpression: `SET ${Object.keys(updateFields).map(k => `#${k} = :${k}`).join(', ')}`,
                    ExpressionAttributeNames: Object.keys(updateFields).reduce((acc, k) => ({ ...acc, [`#${k}`]: k }), {}),
                    ExpressionAttributeValues: Object.keys(updateFields).reduce((acc, k) => ({ ...acc, [`:${k}`]: updateFields[k] }), {})
                }));
                
                console.log(`[SAVE-GAME] ✅ Updated GameCost: ${existingCost.id} with venue fee: ${venueFee || 0}`);
            }
            
            return existingCost.id;
        }
    } catch (error) {
        console.error('[SAVE-GAME] Error checking existing GameCost:', error);
    }
    
    // Create new GameCost
    const costId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();

    // NEW: default dealer cost = #entries * $15.00
    const dealerRatePerEntry = 15;
    const computedDealerCost = (totalEntries || 0) * dealerRatePerEntry;

    monitoring.trackOperation('CREATE', 'GameCost', costId);

    const gameCost = {
        id: costId,
        gameId: gameId,

        // Venue fee
        venueFee: venueFee || 0,

        // Dealer cost default: #entries * $15
        totalDealerCost: computedDealerCost,

        // Initialise all other cost fields to 0
        totalTournamentDirectorCost: 0,
        totalPrizeContribution: 0,
        totalJackpotContribution: 0,
        totalPromotionCost: 0,
        totalFloorStaffCost: 0,
        totalOtherCost: 0,

        // Total cost = venue fee + dealer cost (for now)
        totalCost: (venueFee || 0) + computedDealerCost,

        // Denormalized fields for querying
        entityId: entityId,
        venueId: venueId,
        gameDate: gameStartDateTime,

        // Timestamps
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'GameCost'
    };

    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: gameCostTable,
            Item: gameCost
        }));
        console.log(
          `[SAVE-GAME] ✅ Created GameCost: ${costId} for game: ${gameId} with venue fee: ${venueFee || 0}, dealer cost: ${computedDealerCost}`
        );
        return costId;
    } catch (error) {
        console.error(`[SAVE-GAME] ❌ Error creating GameCost:`, error);
        // Don't fail the entire save if GameCost creation fails
        return null;
    }
};

/**
 * Create new game in DynamoDB - ENHANCED with venue fee and series categorization
 */
const createGame = async (input, venueResolution, seriesResolution) => {
    const gameId = uuidv4();
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    monitoring.trackOperation('CREATE', 'Game', gameId, { 
        entityId: input.source.entityId,
        tournamentId: input.game.tournamentId,
        wasEdited: input.source.wasEdited,
        venueFee: venueResolution.venueFee 
    });
    
    // Calculate financials including venue fee (NEW)
    const financials = calculateFinancials(input.game, venueResolution.venueFee);
    
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
        
        // Financials - ENHANCED with venue fee
        buyIn: input.game.buyIn || 0,
        rake: input.game.rake || 0,
        venueFee: venueResolution.venueFee ?? 0,  // ✅ FIXED: Use 0 if venue has no fee
        totalRake: financials.totalRake,  // ENHANCED
        revenueByBuyIns: financials.revenueByBuyIns,  // ENHANCED
        profitLoss: financials.profitLoss,  // ENHANCED - includes venue fee deduction
        hasGuarantee: input.game.hasGuarantee || false,
        guaranteeAmount: input.game.guaranteeAmount || 0,
        guaranteeOverlay: financials.guaranteeOverlay,
        guaranteeSurplus: financials.guaranteeSurplus,
        startingStack: input.game.startingStack || 0,
        
        // Results
        prizepool: input.game.prizepool || 0,
        totalEntries: input.game.totalEntries || 0,
        totalRebuys: input.game.totalRebuys || 0,
        totalAddons: input.game.totalAddons || 0,
        playersRemaining: input.game.playersRemaining || null,
        totalChipsInPlay: input.game.totalChipsInPlay || null,
        averagePlayerStack: input.game.averagePlayerStack || null,
        
        // Categorization
        tournamentType: input.game.tournamentType,
        isSeries: input.game.isSeries || false,
        isSatellite: input.game.isSatellite || false,
        isRegular: input.game.isRegular || false,
        gameTags: input.game.gameTags || [],
        totalDuration: input.game.totalDuration || null,
        
        // Structure data (levels)
        levels: input.game.levels || [],
        
        // Source tracking
        sourceUrl: input.source.type === 'SCRAPE' ? input.source.sourceId : null,
        tournamentId: input.game.tournamentId,
        wasEdited: input.source.wasEdited || false,
        
        // Venue assignment
        venueId: venueResolution.venueId,
        venueAssignmentStatus: venueResolution.status,
        suggestedVenueName: venueResolution.suggestedName || null,
        venueAssignmentConfidence: venueResolution.confidence,
        requiresVenueAssignment: venueResolution.venueId === UNASSIGNED_VENUE_ID,
        
        // Series assignment - ENHANCED with categorization
        ...(seriesResolution.tournamentSeriesId ? { 
            tournamentSeriesId: seriesResolution.tournamentSeriesId,
            seriesCategory: seriesResolution.seriesCategory,  // NEW
            holidayType: seriesResolution.holidayType  // NEW
        } : {}),
        seriesName: seriesResolution.seriesName || input.game.seriesName,
        seriesAssignmentStatus: seriesResolution.status,
        seriesAssignmentConfidence: seriesResolution.confidence,
        suggestedSeriesName: seriesResolution.suggestedName,
        
        // Series structure fields
        isMainEvent: input.series?.isMainEvent || input.game.isMainEvent || false,
        eventNumber: input.series?.eventNumber || input.game.eventNumber || null,
        dayNumber: input.series?.dayNumber || input.game.dayNumber || null,
        flightLetter: input.series?.flightLetter || input.game.flightLetter || null,
        finalDay: input.series?.finalDay || input.game.finalDay || false,

        // Entity
        entityId: input.source.entityId,
        
        // Timestamps
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'Game'
    };
    
    // Store audit trail if this was edited data
    if (input.auditTrail) {
        const auditInfo = parseAuditTrail(input.auditTrail);
        if (auditInfo) {
            game.lastEditedAt = auditInfo.editedAt;
            game.lastEditedBy = auditInfo.editedBy;
            game.editHistory = JSON.stringify([auditInfo]);
        }
    }
    
    // Save the game to DynamoDB
    await monitoredDdbDocClient.send(new PutCommand({
        TableName: getTableName('Game'),
        Item: game
    }));
    
    console.log(`[SAVE-GAME] ✅ Created game: ${gameId}${input.source.wasEdited ? ' (with edits)' : ''}`);
    console.log(`[SAVE-GAME] Venue fee: ${venueResolution.venueFee || 0}, Profit/Loss: ${financials.profitLoss}`);
    
    // Create the associated GameCost record with venue fee (NEW)
    await createOrUpdateGameCost(
        gameId,
        venueResolution.venueId,
        input.source.entityId,
        game.gameStartDateTime,
        venueResolution.venueFee,
        game.totalEntries || 0
    );
    

    // Create initial GameFinancialSnapshot
    await createOrUpdateGameFinancialSnapshot(
        game,
        input.source.entityId,
        venueResolution.venueId
    );

    return { gameId, game, wasNewGame: true, fieldsUpdated: [] };
};

/**
 * Update existing game in DynamoDB - ENHANCED with venue fee and series categorization
 * PRESERVES conditional update logic based on confidence scores
 */
const updateGame = async (existingGame, input, venueResolution, seriesResolution) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const fieldsUpdated = [];
    
    monitoring.trackOperation('UPDATE', 'Game', existingGame.id, { 
        entityId: input.source.entityId,
        tournamentId: input.game.tournamentId,
        wasEdited: input.source.wasEdited,
        venueFee: venueResolution.venueFee
    });
    
    // Recalculate financials with new venue fee (NEW)
    const financials = calculateFinancials(input.game, venueResolution.venueFee);
    
    // Build update expression dynamically
    const updateFields = {};
    
    // Only update fields that have changed or have values
    const checkAndUpdate = (field, newValue, existingValue) => {
        if (newValue !== undefined && newValue !== null && newValue !== existingValue) {
            updateFields[field] = newValue;
            fieldsUpdated.push(field);
        }
    };
    
    // Core fields
    checkAndUpdate('name', input.game.name, existingGame.name);
    checkAndUpdate('gameStatus', input.game.gameStatus, existingGame.gameStatus);
    checkAndUpdate('registrationStatus', input.game.registrationStatus, existingGame.registrationStatus);
    
    // Financials - ENHANCED with venue fee
    checkAndUpdate('buyIn', input.game.buyIn, existingGame.buyIn);
    const newVenueFee = venueResolution.venueFee ?? 0;
    if (newVenueFee !== existingGame.venueFee) {
        updateFields.venueFee = newVenueFee;
        fieldsUpdated.push('venueFee');
    }
    checkAndUpdate('rake', input.game.rake, existingGame.rake);
    checkAndUpdate('totalRake', financials.totalRake, existingGame.totalRake);  // ENHANCED
    checkAndUpdate('revenueByBuyIns', financials.revenueByBuyIns, existingGame.revenueByBuyIns);  // ENHANCED
    checkAndUpdate('profitLoss', financials.profitLoss, existingGame.profitLoss);  // ENHANCED
    checkAndUpdate('hasGuarantee', input.game.hasGuarantee, existingGame.hasGuarantee);
    checkAndUpdate('guaranteeAmount', input.game.guaranteeAmount, existingGame.guaranteeAmount);
    checkAndUpdate('guaranteeOverlay', financials.guaranteeOverlay, existingGame.guaranteeOverlay);
    checkAndUpdate('guaranteeSurplus', financials.guaranteeSurplus, existingGame.guaranteeSurplus);
    checkAndUpdate('startingStack', input.game.startingStack, existingGame.startingStack);
    
    // Results
    checkAndUpdate('prizepool', input.game.prizepool, existingGame.prizepool);
    checkAndUpdate('totalEntries', input.game.totalEntries, existingGame.totalEntries);
    checkAndUpdate('totalRebuys', input.game.totalRebuys, existingGame.totalRebuys);
    checkAndUpdate('totalAddons', input.game.totalAddons, existingGame.totalAddons);
    checkAndUpdate('playersRemaining', input.game.playersRemaining, existingGame.playersRemaining);
    checkAndUpdate('totalChipsInPlay', input.game.totalChipsInPlay, existingGame.totalChipsInPlay);
    checkAndUpdate('averagePlayerStack', input.game.averagePlayerStack, existingGame.averagePlayerStack);
    
    // Additional fields
    checkAndUpdate('totalDuration', input.game.totalDuration, existingGame.totalDuration);
    checkAndUpdate('isRegular', input.game.isRegular, existingGame.isRegular);
    checkAndUpdate('isSeries', input.game.isSeries, existingGame.isSeries);
    checkAndUpdate('isSatellite', input.game.isSatellite, existingGame.isSatellite);
    
    // Structure (levels)
    if (input.game.levels) {
        checkAndUpdate('levels', input.game.levels, existingGame.levels);
    }
    
    // Dates
    if (input.game.gameEndDateTime) {
        checkAndUpdate('gameEndDateTime', ensureISODate(input.game.gameEndDateTime), existingGame.gameEndDateTime);
    }
    
    // Venue (only update if better confidence or explicit assignment) - PRESERVED LOGIC
    if (venueResolution.confidence > (existingGame.venueAssignmentConfidence || 0) ||
        venueResolution.status === 'MANUALLY_ASSIGNED') {
        checkAndUpdate('venueId', venueResolution.venueId, existingGame.venueId);
        checkAndUpdate('venueAssignmentStatus', venueResolution.status, existingGame.venueAssignmentStatus);
        checkAndUpdate('venueAssignmentConfidence', venueResolution.confidence, existingGame.venueAssignmentConfidence);
        checkAndUpdate('requiresVenueAssignment', venueResolution.venueId === UNASSIGNED_VENUE_ID, existingGame.requiresVenueAssignment);
        if (venueResolution.suggestedName) {
            checkAndUpdate('suggestedVenueName', venueResolution.suggestedName, existingGame.suggestedVenueName);
        }
    }
    
    // Series (only update if better confidence or explicit assignment) - PRESERVED LOGIC + ENHANCED
    if (seriesResolution.confidence > (existingGame.seriesAssignmentConfidence || 0) ||
        seriesResolution.status === 'MANUALLY_ASSIGNED') {
        checkAndUpdate('tournamentSeriesId', seriesResolution.tournamentSeriesId, existingGame.tournamentSeriesId);
        checkAndUpdate('seriesName', seriesResolution.seriesName, existingGame.seriesName);
        checkAndUpdate('seriesCategory', seriesResolution.seriesCategory, existingGame.seriesCategory);  // NEW
        checkAndUpdate('holidayType', seriesResolution.holidayType, existingGame.holidayType);  // NEW
        checkAndUpdate('seriesAssignmentStatus', seriesResolution.status, existingGame.seriesAssignmentStatus);
        checkAndUpdate('seriesAssignmentConfidence', seriesResolution.confidence, existingGame.seriesAssignmentConfidence);
        if (seriesResolution.suggestedName) {
            checkAndUpdate('suggestedSeriesName', seriesResolution.suggestedName, existingGame.suggestedSeriesName);
        }
    }
    
    // Series structure fields (always check for updates) - PRESERVED
    checkAndUpdate('isMainEvent', input.series?.isMainEvent || input.game.isMainEvent, existingGame.isMainEvent);
    checkAndUpdate('eventNumber', input.series?.eventNumber || input.game.eventNumber, existingGame.eventNumber);
    checkAndUpdate('dayNumber', input.series?.dayNumber || input.game.dayNumber, existingGame.dayNumber);
    checkAndUpdate('flightLetter', input.series?.flightLetter || input.game.flightLetter, existingGame.flightLetter);
    checkAndUpdate('finalDay', input.series?.finalDay || input.game.finalDay, existingGame.finalDay);

    // Track if this was edited data - PRESERVED
    if (input.source.wasEdited) {
        updateFields.wasEdited = true;
        
        // Handle audit trail
        if (input.auditTrail) {
            const auditInfo = parseAuditTrail(input.auditTrail);
            if (auditInfo) {
                updateFields.lastEditedAt = auditInfo.editedAt;
                updateFields.lastEditedBy = auditInfo.editedBy;
                
                // Append to edit history - PRESERVED (with 10 edit limit)
                let editHistory = [];
                try {
                    if (existingGame.editHistory) {
                        editHistory = JSON.parse(existingGame.editHistory);
                    }
                } catch (e) {
                    console.warn('[SAVE-GAME] Could not parse existing edit history');
                }
                editHistory.push(auditInfo);
                
                // Keep only last 10 edits - PRESERVED
                if (editHistory.length > 10) {
                    editHistory = editHistory.slice(-10);
                }
                
                updateFields.editHistory = JSON.stringify(editHistory);
            }
        }
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
        
        console.log(`[SAVE-GAME] ✅ Updated game ${existingGame.id}, fields: ${fieldsUpdated.join(', ')}${input.source.wasEdited ? ' (edited data)' : ''}`);
        console.log(`[SAVE-GAME] Venue fee: ${venueResolution.venueFee || 0}, Profit/Loss: ${financials.profitLoss}`);
    } else {
        console.log(`[SAVE-GAME] No changes detected for game ${existingGame.id}`);
    }
    
    // Update GameCost record with new venue fee and entries
    await createOrUpdateGameCost(
        updatedGame.id,
        venueResolution.venueId,
        input.source.entityId,
        updatedGame.gameStartDateTime,
        venueResolution.venueFee,
        updatedGame.totalEntries || 0
    );

    // Update GameFinancialSnapshot for this game
    await createOrUpdateGameFinancialSnapshot(
        updatedGame,
        input.source.entityId,
        venueResolution.venueId
    );

    // Return merged game object
    return { gameId: updatedGame.id, game: updatedGame, wasNewGame: false, fieldsUpdated };
};

// ===================================================================
// SCRAPE TRACKING - PRESERVED
// ===================================================================

/**
 * Update ScrapeURL tracking (for scrape sources) - PRESERVED
 */
const updateScrapeURL = async (sourceUrl, gameId, gameStatus, doNotScrape = false, wasEdited = false) => {
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
                    wasEdited = :wasEdited,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':gameId': gameId,
                ':gameStatus': gameStatus,
                ':status': doNotScrape ? 'SKIPPED_DONOTSCRAPE' : (wasEdited ? 'SUCCESS_EDITED' : 'SUCCESS'),
                ':now': now,
                ':dns': doNotScrape,
                ':wasEdited': wasEdited
            }
        }));
        
        console.log(`[SAVE-GAME] Updated ScrapeURL: ${sourceUrl}`);
    } catch (error) {
        console.error(`[SAVE-GAME] Error updating ScrapeURL:`, error);
    }
};

/**
 * Create ScrapeAttempt record - PRESERVED with full metadata
 */
const createScrapeAttempt = async (input, gameId, wasNewGame, fieldsUpdated) => {
    const attemptId = uuidv4();
    const now = new Date().toISOString();
    
    monitoring.trackOperation('INSERT', 'ScrapeAttempt', attemptId);
    
    // Determine status - PRESERVED
    let status = 'SUCCESS';
    if (wasNewGame) status = 'SAVED';
    else if (fieldsUpdated.length > 0) status = 'UPDATED';
    else status = 'NO_CHANGES';
    
    // If edited data, append to status
    if (input.source.wasEdited) {
        status = status + '_EDITED';
    }
    
    const attempt = {
        id: attemptId,
        url: input.source.sourceId,
        scrapedAt: input.source.fetchedAt || now,
        status: status,
        gameStatus: input.game.gameStatus,
        fieldsExtracted: Object.keys(input.game).filter(k => input.game[k] !== null && input.game[k] !== undefined),  // PRESERVED
        fieldsUpdated: fieldsUpdated,  // PRESERVED
        wasNewGame: wasNewGame,
        wasEdited: input.source.wasEdited || false,
        gameId: gameId,
        entityId: input.source.entityId,
        contentHash: input.source.contentHash,  // PRESERVED
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
// PLAYER PROCESSING QUEUE - PRESERVED
// ===================================================================

/**
 * Determine if game should be queued for player processing - PRESERVED
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
 * Queue game for Player Data Processor - PRESERVED with full message details
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
            tournamentSeriesId: game.tournamentSeriesId,
            isSatellite: game.isSatellite,
            gameFrequency: game.gameFrequency,
            wasEdited: game.wasEdited || false
        },
        players: input.players,
        metadata: {
            processedAt: new Date().toISOString(),
            sourceUrl: input.source.sourceId,
            venueId: game.venueId,
            entityId: game.entityId,
            hasCompleteResults: input.players.hasCompleteResults,
            totalPlayersProcessed: input.players.allPlayers.length,
            totalPrizesPaid: input.players.totalPrizesPaid || 0,
            wasEdited: input.source.wasEdited || false
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
 * Update player entries for live games (without full PDP processing) - PRESERVED
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
// MAIN HANDLER - PRESERVED
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
        entityId: input.source?.entityId,
        wasEdited: input.source?.wasEdited 
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
        
        // === 3. RESOLVE VENUE (with fee) ===
        const venueResolution = await resolveVenue(input.venue, input.source.entityId);
        console.log(`[SAVE-GAME] Venue resolved:`, venueResolution);
        
        // === 4. RESOLVE SERIES (with categorization) ===
        // Pass gameStartDateTime so we can extract the year for matching
        const seriesResolution = input.game.isSeries && input.series 
            ? await resolveSeries(
                input.series, 
                input.source.entityId, 
                input.game.gameStartDateTime,
                venueResolution.venueId  // Pass the resolved venue for better matching
            )
            : { 
                tournamentSeriesId: null, 
                seriesName: null, 
                seriesCategory: null,  // NEW
                holidayType: null,  // NEW
                quarter: null,  // NEW
                month: null,  // NEW
                status: 'NOT_SERIES', 
                confidence: 0 
            };
        console.log(`[SAVE-GAME] Series resolved:`, seriesResolution);

        // === 5. FIND EXISTING GAME ===
        const existingGame = await findExistingGame(input);
        
        // === 6. CREATE OR UPDATE GAME ===
        let saveResult;
        
        if (existingGame && !input.options?.forceUpdate) {
            // Check if we should skip or update
            const hasChanges = input.game.gameStatus !== existingGame.gameStatus ||
                               input.game.totalEntries !== existingGame.totalEntries ||
                               input.game.prizepool !== existingGame.prizepool ||
                               venueResolution.venueFee !== existingGame.venueFee ||  // NEW - Check venue fee changes
                               input.source.wasEdited; // Always update if edited
            
            if (!hasChanges) {
                console.log(`[SAVE-GAME] Game exists with no changes, skipping`);
                saveResult = {
                    gameId: existingGame.id,
                    game: existingGame,
                    wasNewGame: false,
                    fieldsUpdated: []
                };
            } else {
                saveResult = await updateGame(existingGame, input, venueResolution, seriesResolution);
            }
        } else if (existingGame && input.options?.forceUpdate) {
            saveResult = await updateGame(existingGame, input, venueResolution, seriesResolution);
        } else {
            saveResult = await createGame(input, venueResolution, seriesResolution);
        }
        
        const { gameId, game, wasNewGame, fieldsUpdated } = saveResult;
        
        // === 7. TRACK SCRAPE (for scrape sources) ===
        if (input.source.type === 'SCRAPE') {
            await updateScrapeURL(
                input.source.sourceId, 
                gameId, 
                game.gameStatus,
                input.options?.doNotScrape,
                input.source.wasEdited
            );
            await createScrapeAttempt(input, gameId, wasNewGame, fieldsUpdated);
        }
        
        // === 8. DETERMINE IF FINISHED AND QUEUE FOR PDP ===
        const pdpDecision = shouldQueueForPDP(input, game);
        let playerProcessingQueued = false;
        
        if (pdpDecision.shouldQueue) {
            await queueForPDP(game, input);
            playerProcessingQueued = true;
        } else if (pdpDecision.updateEntriesOnly) {
            // Live game - just update entries
            await updatePlayerEntries(game, input);
        }
        
        // === 9. BUILD RESPONSE ===
        const action = wasNewGame ? 'CREATED' : 
                       fieldsUpdated.length > 0 ? 'UPDATED' : 'SKIPPED';
        
        // Add note if this was edited data
        const messageDetail = input.source.wasEdited ? ' (with edited data)' : '';
        
        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', action, { 
            gameId, 
            entityId: input.source.entityId,
            wasEdited: input.source.wasEdited,
            fieldsUpdated: fieldsUpdated.length,
            venueFee: venueResolution.venueFee  // NEW
        });
        
        return {
            success: true,
            gameId: gameId,
            action: action,
            message: `Game ${action.toLowerCase()} successfully${messageDetail}`,
            warnings: validation.warnings,
            playerProcessingQueued: playerProcessingQueued,
            playerProcessingReason: pdpDecision.reason,
            venueAssignment: {
                venueId: venueResolution.venueId,
                venueName: venueResolution.venueName,
                venueFee: venueResolution.venueFee,  // NEW
                status: venueResolution.status,
                confidence: venueResolution.confidence
            },
            seriesAssignment: {
                tournamentSeriesId: seriesResolution.tournamentSeriesId,
                seriesName: seriesResolution.seriesName,
                seriesCategory: seriesResolution.seriesCategory,  // NEW
                holidayType: seriesResolution.holidayType,  // NEW
                status: seriesResolution.status,
                confidence: seriesResolution.confidence
            },
            fieldsUpdated: fieldsUpdated,
            wasEdited: input.source.wasEdited || false
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