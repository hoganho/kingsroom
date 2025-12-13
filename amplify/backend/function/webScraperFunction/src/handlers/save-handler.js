/**
 * ===================================================================
 * Save Handler
 * ===================================================================
 * 
 * PASSTHROUGH to saveGameFunction Lambda.
 * 
 * This handler does NOT save directly to the Game table.
 * It builds a SaveGameInput payload and invokes saveGameFunction.
 * 
 * WHY:
 * - Single source of truth for all game saves
 * - saveGameFunction handles venue resolution, series creation, etc.
 * - webScraperFunction stays focused on fetch + parse
 * 
 * ===================================================================
 */

const { InvokeCommand } = require('@aws-sdk/client-lambda');
const { QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SAVE_GAME_FUNCTION_NAME } = require('../config/constants');
const { getTableName } = require('../config/tables');

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
 * Extract player data for processing
 */
const extractPlayerDataForProcessing = (scrapedData) => {
    if (!scrapedData) return {
        allPlayers: [],
        totalUniquePlayers: 0,
        hasCompleteResults: false
    };
    
    const results = scrapedData.results || [];
    const entries = scrapedData.entries || [];
    const seating = scrapedData.seating || [];
    const playerMap = new Map();
    
    if (results.length > 0) {
        results.forEach(result => {
            if (result.name) {
                playerMap.set(result.name, {
                    name: result.name,
                    rank: result.rank,
                    winnings: result.winnings || 0,
                    points: result.points || 0,
                    isQualification: result.isQualification || false
                });
            }
        });
    } else {
        entries.forEach(entry => {
            if (entry.name && !playerMap.has(entry.name)) {
                playerMap.set(entry.name, { name: entry.name });
            }
        });
        seating.forEach(seat => {
            if (seat.name && !playerMap.has(seat.name)) {
                playerMap.set(seat.name, { name: seat.name });
            }
        });
    }
    
    const allPlayers = Array.from(playerMap.values());
    const hasCompleteResults = results.length > 0 && results.some(r => r.rank);
    
    return {
        allPlayers,
        totalUniquePlayers: allPlayers.length,
        hasCompleteResults
    };
};

/**
 * Get tournament ID from URL
 */
const getTournamentIdFromUrl = (url) => {
    if (!url) return 0;
    try {
        const match = url.match(/[?&]id=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    } catch {
        return 0;
    }
};

/**
 * Handle saveTournamentData operation
 * Delegates to saveGameFunction Lambda
 * 
 * @param {object} options - Save options
 * @param {string} options.sourceUrl - Tournament URL
 * @param {string} options.venueId - Venue ID (optional)
 * @param {object} options.data - Scraped tournament data
 * @param {string} options.existingGameId - Existing game ID for updates
 * @param {boolean} options.doNotScrape - Mark as do not scrape
 * @param {string} options.entityId - Entity ID
 * @param {string} options.scraperJobId - Scraper job ID
 * @param {object} context - Shared context
 * @returns {object} Save result
 */
const handleSave = async (options, context) => {
    const {
        sourceUrl,
        venueId,
        data,
        existingGameId,
        doNotScrape = false,
        entityId,
        scraperJobId = null
    } = options;
    
    const { lambdaClient, ddbDocClient, monitoring } = context;
    
    console.log(`[SaveHandler] Delegating save to saveGameFunction for ${sourceUrl}`);
    
    // Parse data if string
    let parsedData;
    try {
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
        console.error('[SaveHandler] Failed to parse data:', error);
        parsedData = {};
    }
    
    const tournamentId = parsedData.tournamentId || getTournamentIdFromUrl(sourceUrl);
    
    // Extract player data
    const playerData = extractPlayerDataForProcessing(parsedData);
    
    // Build SaveGameInput for saveGameFunction
    const saveGameInput = {
        source: {
            type: 'SCRAPE',
            sourceId: sourceUrl,
            entityId,
            fetchedAt: new Date().toISOString(),
            contentHash: parsedData.contentHash || null
        },
        game: {
            tournamentId,
            existingGameId: existingGameId || null,
            name: parsedData.name || `Tournament ${tournamentId}`,
            gameType: parsedData.gameType || 'TOURNAMENT',
            gameStatus: parsedData.gameStatus || 'SCHEDULED',
            gameVariant: parsedData.gameVariant || 'NLHE',
            gameStartDateTime: ensureISODate(parsedData.gameStartDateTime),
            gameEndDateTime: parsedData.gameEndDateTime ? ensureISODate(parsedData.gameEndDateTime) : null,
            registrationStatus: parsedData.registrationStatus || null,
            buyIn: parsedData.buyIn || 0,
            rake: parsedData.rake || 0,
            startingStack: parsedData.startingStack || 0,
            hasGuarantee: parsedData.hasGuarantee || false,
            guaranteeAmount: parsedData.guaranteeAmount || 0,
            prizepoolPaid: parsedData.prizepoolPaid || 0,
            prizepoolCalculated: parsedData.prizepoolCalculated || 0,
            totalUniquePlayers: parsedData.totalUniquePlayers || 0,
            totalInitialEntries: parsedData.totalInitialEntries || 0,
            totalEntries: parsedData.totalEntries || 0,
            playersRemaining: parsedData.playersRemaining || null,
            totalRebuys: parsedData.totalRebuys || 0,
            totalAddons: parsedData.totalAddons || 0,
            totalDuration: parsedData.totalDuration || null,
            isSatellite: parsedData.isSatellite || false,
            isSeries: parsedData.isSeries || false,
            isRegular: parsedData.isRegular || false,
            seriesName: parsedData.seriesName || null,
            gameFrequency: parsedData.gameFrequency || null,
            gameTags: parsedData.gameTags || [],
            levels: parsedData.levels || [],
            // Financial metrics
            totalBuyInsCollected: parsedData.totalBuyInsCollected || null,
            rakeRevenue: parsedData.rakeRevenue || null,
            prizepoolPlayerContributions: parsedData.prizepoolPlayerContributions || null,
            prizepoolAddedValue: parsedData.prizepoolAddedValue || null,
            prizepoolSurplus: parsedData.prizepoolSurplus || null,
            guaranteeOverlayCost: parsedData.guaranteeOverlayCost || null,
            gameProfit: parsedData.gameProfit || null,
            // Recurring game fields
            recurringGameId: parsedData.recurringGameId || null,
            recurringGameAssignmentStatus: parsedData.recurringGameAssignmentStatus || 'PENDING_ASSIGNMENT',
            recurringGameAssignmentConfidence: parsedData.recurringGameAssignmentConfidence || 0
        },
        series: parsedData.isSeries ? {
            seriesId: parsedData.tournamentSeriesId || null,
            seriesName: parsedData.seriesName || null,
            suggestedSeriesId: parsedData.seriesMatch?.autoAssignedSeries?.id || null,
            confidence: parsedData.seriesMatch?.autoAssignedSeries?.score || 0,
            isMainEvent: parsedData.isMainEvent || false,
            eventNumber: parsedData.eventNumber || null,
            dayNumber: parsedData.dayNumber || null,
            flightLetter: parsedData.flightLetter || null,
            finalDay: parsedData.finalDay || false,
            year: parsedData.seriesYear || new Date(parsedData.gameStartDateTime || new Date()).getFullYear()
        } : null,
        players: playerData.totalUniquePlayers > 0 ? {
            allPlayers: playerData.allPlayers,
            totalUniquePlayers: playerData.totalUniquePlayers,
            hasCompleteResults: playerData.hasCompleteResults
        } : null,
        venue: {
            venueId: venueId || null,
            venueName: parsedData.venueName || null,
            suggestedVenueId: parsedData.venueMatch?.autoAssignedVenue?.id || null,
            confidence: parsedData.venueMatch?.suggestions?.[0]?.score || 0
        },
        options: {
            skipPlayerProcessing: false,
            forceUpdate: !!existingGameId,
            doNotScrape,
            scraperJobId
        }
    };
    
    // Invoke saveGameFunction Lambda
    try {
        monitoring.trackOperation('INVOKE_SAVE_GAME', 'Game', tournamentId.toString(), { entityId });
        
        const invokeCommand = new InvokeCommand({
            FunctionName: SAVE_GAME_FUNCTION_NAME,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ input: saveGameInput })
        });
        
        const response = await lambdaClient.send(invokeCommand);
        
        // Parse response
        const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
        
        if (responsePayload.errorMessage) {
            throw new Error(responsePayload.errorMessage);
        }
        
        console.log(`[SaveHandler] saveGameFunction response:`, {
            success: responsePayload.success,
            action: responsePayload.action,
            gameId: responsePayload.gameId,
            playerProcessingQueued: responsePayload.playerProcessingQueued
        });
        
        if (!responsePayload.success) {
            throw new Error(responsePayload.message || 'saveGameFunction failed');
        }
        
        // Link S3Storage to game (if applicable)
        if (responsePayload.success && responsePayload.gameId && parsedData.s3Key) {
            await linkS3StorageToGame(
                tournamentId,
                entityId,
                responsePayload.gameId,
                responsePayload.action,
                ddbDocClient
            );
        }
        
        // Return compatible response structure
        return {
            id: responsePayload.gameId,
            name: parsedData.name,
            gameStatus: parsedData.gameStatus,
            venueId: responsePayload.venueAssignment?.venueId,
            entityId,
            sourceUrl,
            action: responsePayload.action,
            playerProcessingQueued: responsePayload.playerProcessingQueued,
            playerProcessingReason: responsePayload.playerProcessingReason,
            fieldsUpdated: responsePayload.fieldsUpdated || []
        };
        
    } catch (error) {
        console.error(`[SaveHandler] Error invoking saveGameFunction:`, error);
        monitoring.trackOperation('SAVE_GAME_ERROR', 'Game', tournamentId.toString(), {
            error: error.message,
            entityId
        });
        throw error;
    }
};

/**
 * Link S3Storage record to saved game
 */
const linkS3StorageToGame = async (tournamentId, entityId, gameId, action, ddbDocClient) => {
    try {
        const s3StorageTable = getTableName('S3Storage');
        
        // Find the S3Storage record
        const queryResult = await ddbDocClient.send(new QueryCommand({
            TableName: s3StorageTable,
            IndexName: 'byTournamentId',
            KeyConditionExpression: 'tournamentId = :tid',
            FilterExpression: 'entityId = :eid',
            ExpressionAttributeValues: {
                ':tid': tournamentId,
                ':eid': entityId
            },
            ScanIndexForward: false,
            Limit: 1
        }));
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            const s3Record = queryResult.Items[0];
            const now = new Date().toISOString();
            const timestamp = Date.now();
            
            await ddbDocClient.send(new UpdateCommand({
                TableName: s3StorageTable,
                Key: { id: s3Record.id },
                UpdateExpression: `
                    SET gameId = :gameId,
                        wasGameCreated = :created,
                        wasGameUpdated = :updated,
                        updatedAt = :now,
                        #lca = :timestamp
                `,
                ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
                ExpressionAttributeValues: {
                    ':gameId': gameId,
                    ':created': action === 'CREATED',
                    ':updated': action === 'UPDATED',
                    ':now': now,
                    ':timestamp': timestamp
                }
            }));
            
            console.log(`[SaveHandler] Linked S3Storage ${s3Record.id} to game ${gameId}`);
        }
    } catch (linkError) {
        console.warn('[SaveHandler] Failed to link S3Storage to game:', linkError.message);
    }
};

module.exports = {
    handleSave,
    extractPlayerDataForProcessing,
    ensureISODate,
    linkS3StorageToGame
};
