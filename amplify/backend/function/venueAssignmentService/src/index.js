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
    API_KINGSROOM_PLAYERVENUETABLE_ARN
    API_KINGSROOM_PLAYERVENUETABLE_NAME
    API_KINGSROOM_VENUEDETAILSTABLE_ARN
    API_KINGSROOM_VENUEDETAILSTABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');
// --- End Lambda Monitoring ---

const client = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(client); // Renamed original client

// --- Lambda Monitoring Initialization ---
// Initialize monitoring for this function. Entity ID is null as it's not global for this func.
const monitoring = new LambdaMonitoring('venueAssignmentService', null);
// Wrap the DynamoDB client to automatically track operations
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(originalDdbDocClient);
// --- End Lambda Monitoring ---

// Constants
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Generate table names based on Amplify naming convention
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables.`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * VenueAssignmentService class handles retroactive venue assignment
 */
class VenueAssignmentService {
    
    /**
     * Main method to assign venue to a game and update all related records
     */
    async assignVenueToGame(gameId, newVenueId, options = {}) {
        // ✅ Track business logic: Start of the main assignment transaction
        monitoring.trackOperation('ASSIGN_VENUE_START', 'Game', gameId, { gameId, newVenueId });

        const transaction = {
            gameId,
            newVenueId,
            previousVenueId: null,
            affectedRecords: {
                gameUpdated: false,
                playerEntriesUpdated: 0,
                playerVenueRecordsCreated: 0,
                playersWithRegistrationUpdated: 0,
                playerSummariesUpdated: 0
            },
            errors: []
        };
        
        try {
            // Step 1: Update Game record
            const game = await this.updateGameVenue(gameId, newVenueId);
            transaction.previousVenueId = game.previousVenueId;
            transaction.affectedRecords.gameUpdated = true;
            
            // Step 2: Update all PlayerEntry records for this game
            const entriesUpdated = await this.updatePlayerEntries(gameId, newVenueId);
            transaction.affectedRecords.playerEntriesUpdated = entriesUpdated;
            
            // Step 3: Update Player registrationVenueId (if this was their first game)
            const playersUpdated = await this.updatePlayerRegistrationVenues(gameId, newVenueId, game);
            transaction.affectedRecords.playersWithRegistrationUpdated = playersUpdated;
            
            // Step 4: Create/Update PlayerVenue records
            const venueRecordsCreated = await this.createPlayerVenueRecords(gameId, newVenueId, game);
            transaction.affectedRecords.playerVenueRecordsCreated = venueRecordsCreated;
            
            // Step 5: Update PlayerSummary records (if needed)
            const summariesUpdated = await this.updatePlayerSummaries(gameId, newVenueId);
            transaction.affectedRecords.playerSummariesUpdated = summariesUpdated;
            
            return { success: true, transaction };
            
        } catch (error) {
            transaction.errors.push(error.message);
            // ✅ Track business logic: Error during assignment
            monitoring.trackOperation('ASSIGN_VENUE_ERROR', 'Game', gameId, { error: error.message, gameId, newVenueId });
            return { success: false, transaction, error: error.message };
        }
    }
    
    /**
     * Update the Game record with new venue
     */
    async updateGameVenue(gameId, newVenueId) {
        // ✅ Track business logic: Assignment Step 1
        monitoring.trackOperation('ASSIGN_VENUE_STEP_GAME', 'Game', gameId, { newVenueId });
        const gameTable = getTableName('Game');
        
        // Get current game state
        const game = await monitoredDdbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: gameId }
        }));
        
        if (!game.Item) throw new Error(`Game ${gameId} not found`);
        
        const previousVenueId = game.Item.venueId;
        
        // Update game with new venue
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: gameTable,
            Key: { id: gameId },
            UpdateExpression: `
                SET venueId = :newVenueId,
                    venueAssignmentStatus = :status,
                    requiresVenueAssignment = :false,
                    updatedAt = :now,
                    #v = if_not_exists(#v, :zero) + :inc
            `,
            ExpressionAttributeNames: {
                '#v': '_version' // <-- Renamed placeholder
            },
            ExpressionAttributeValues: {
                ':newVenueId': newVenueId,
                ':status': 'MANUALLY_ASSIGNED',
                ':false': false,
                ':now': new Date().toISOString(),
                ':inc': 1,
                ':zero': 0 // <-- Added this line
            }
        }));
        
        return { ...game.Item, previousVenueId };
    }
    
    /**
     * Update all PlayerEntry records for this game
     */
    async updatePlayerEntries(gameId, newVenueId) {
        // ✅ Track business logic: Assignment Step 2
        monitoring.trackOperation('ASSIGN_VENUE_STEP_ENTRIES', 'PlayerEntry', gameId, { gameId, newVenueId });
        const playerEntryTable = getTableName('PlayerEntry');
        
        // Query all entries for this game
        const entries = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: playerEntryTable,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (!entries.Items || entries.Items.length === 0) return 0;
        
        // Batch update all entries
        const updatePromises = entries.Items.map(entry =>
            monitoredDdbDocClient.send(new UpdateCommand({
                TableName: playerEntryTable,
                Key: { id: entry.id },
                UpdateExpression: 'SET venueId = :venueId, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':venueId': newVenueId,
                    ':now': new Date().toISOString()
                }
            }))
        );
        
        await Promise.all(updatePromises);
        return entries.Items.length;
    }
    
    /**
     * Update Player registrationVenueId ONLY if this was their first game
     */
    async updatePlayerRegistrationVenues(gameId, newVenueId, gameData) {
        // ✅ Track business logic: Assignment Step 3
        monitoring.trackOperation('ASSIGN_VENUE_STEP_PLAYER_REG', 'Player', gameId, { gameId, newVenueId });
        const playerTable = getTableName('Player');
        const playerEntryTable = getTableName('PlayerEntry');
        let updatedCount = 0;
        
        // Get all player entries for this game
        const entries = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: playerEntryTable,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (!entries.Items) return 0;
        
        // For each player, check if this game was their first
        for (const entry of entries.Items) {
            const player = await monitoredDdbDocClient.send(new GetCommand({
                TableName: playerTable,
                Key: { id: entry.playerId }
            }));
            
            if (!player.Item) continue;
            
            // Check conditions for updating registrationVenueId:
            // 1. Current registrationVenueId is null or UNASSIGNED
            // 2. This game's date matches the player's firstGamePlayed date
            const needsUpdate = (
                (!player.Item.registrationVenueId || 
                 player.Item.registrationVenueId === UNASSIGNED_VENUE_ID) &&
                player.Item.firstGamePlayed === gameData.gameStartDateTime
            );
            
            if (needsUpdate) {
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: playerTable,
                    Key: { id: entry.playerId },
                    UpdateExpression: `
                        SET registrationVenueId = :venueId,
                            venueAssignmentStatus = :status,
                            updatedAt = :now
                    `,
                    ExpressionAttributeValues: {
                        ':venueId': newVenueId,
                        ':status': 'RETROACTIVE_ASSIGNED',
                        ':now': new Date().toISOString()
                    }
                }));
                updatedCount++;
            }
        }
        
        return updatedCount;
    }
    
    /**
     * Create PlayerVenue records for all players in this game
     */
    async createPlayerVenueRecords(gameId, newVenueId, gameData) {
        // ✅ Track business logic: Assignment Step 4
        monitoring.trackOperation('ASSIGN_VENUE_STEP_PLAYER_VENUE', 'PlayerVenue', gameId, { gameId, newVenueId });
        const playerVenueTable = getTableName('PlayerVenue');
        const playerEntryTable = getTableName('PlayerEntry');
        let createdCount = 0;
        
        // Skip if assigning to UNASSIGNED venue
        if (newVenueId === UNASSIGNED_VENUE_ID) return 0;
        
        // Get all player entries
        const entries = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: playerEntryTable,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (!entries.Items) return 0;
        
        for (const entry of entries.Items) {
            const playerVenueId = `${entry.playerId}#${newVenueId}`;
            
            // Check if PlayerVenue exists
            const existing = await monitoredDdbDocClient.send(new GetCommand({
                TableName: playerVenueTable,
                Key: { id: playerVenueId }
            }));
            
            if (!existing.Item) {
                // Create new PlayerVenue record
                await monitoredDdbDocClient.send(new PutCommand({
                    TableName: playerVenueTable,
                    Item: {
                        id: playerVenueId,
                        playerId: entry.playerId,
                        venueId: newVenueId,
                        totalGamesPlayed: 1,
                        firstPlayedDate: gameData.gameStartDateTime,
                        lastPlayedDate: gameData.gameStartDateTime,
                        membershipCreatedDate: gameData.gameStartDateTime,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        _version: 1,
                        _lastChangedAt: Date.now(),
                        __typename: 'PlayerVenue'
                    }
                }));
                createdCount++;
            } else {
                // Update existing (increment games played)
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: playerVenueTable,
                    Key: { id: playerVenueId },
                    UpdateExpression: `
                        SET totalGamesPlayed = totalGamesPlayed + :one,
                            lastPlayedDate = :gameDate,
                            updatedAt = :now
                    `,
                    ExpressionAttributeValues: {
                        ':one': 1,
                        ':gameDate': gameData.gameStartDateTime,
                        ':now': new Date().toISOString()
                    }
                }));
            }
        }
        
        return createdCount;
    }
    
    /**
     * Update PlayerSummary records for all affected players
     */
    async updatePlayerSummaries(gameId, newVenueId) {
        // ✅ Track business logic: Assignment Step 5
        monitoring.trackOperation('ASSIGN_VENUE_STEP_SUMMARY', 'PlayerSummary', gameId, { gameId, newVenueId });
        // This is a simplified version - you may need to add more logic
        // based on your PlayerSummary structure and requirements
        console.log(`[VenueAssignment] PlayerSummary updates not implemented yet for game ${gameId}`);
        return 0;
    }
    
    /**
     * Batch assign venues to multiple games
     */
    async batchAssignVenues(assignments) {
        // ✅ Track business logic: Starting a batch assignment
        monitoring.trackOperation('BATCH_ASSIGN_VENUE_START', 'Game', 'batch', { count: assignments.length });
        const results = [];
        
        for (const { gameId, venueId } of assignments) {
            const result = await this.assignVenueToGame(gameId, venueId);
            results.push({
                gameId,
                venueId,
                ...result
            });
        }
        
        return results;
    }
    
    /**
     * Get games needing venue assignment
     */
    async getGamesNeedingVenue(limit = 50, nextToken = null) {
        // ✅ Track business logic: Getting games that need a venue
        monitoring.trackOperation('GET_GAMES_NEEDING_VENUE', 'Game', 'unassigned', { limit });
        const gameTable = getTableName('Game');
        
        const params = {
            TableName: gameTable,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            FilterExpression: 'requiresVenueAssignment = :true',
            ExpressionAttributeValues: {
                ':venueId': UNASSIGNED_VENUE_ID,
                ':true': true
            },
            Limit: limit
        };
        
        if (nextToken) {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const result = await monitoredDdbDocClient.send(new QueryCommand(params));
        
        return {
            items: result.Items || [],
            nextToken: result.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null,
            totalCount: result.Count || 0
        };
    }
    
    /**
     * Get venue assignment summary
     */
    async getVenueAssignmentSummary() {
        // ✅ Track business logic: Getting the venue assignment summary
        monitoring.trackOperation('GET_VENUE_SUMMARY', 'Game', 'summary');
        const gameTable = getTableName('Game');
        
        // This is a simplified version - you might want to use aggregation
        // or multiple queries for better performance in production
        
        const unassignedGames = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            ExpressionAttributeValues: {
                ':venueId': UNASSIGNED_VENUE_ID
            },
            Select: 'COUNT'
        }));
        
        // You would need additional queries to get total games, etc.
        // This is a simplified example
        
        return {
            totalGames: 0, // Would need a scan or separate counter
            gamesWithVenue: 0, // Would need calculation
            gamesNeedingVenue: unassignedGames.Count || 0,
            pendingAssignments: unassignedGames.Count || 0
        };
    }
}

// Lambda handler
exports.handler = async (event) => {
    console.log('[VenueAssignmentService] Request received:', JSON.stringify(event));
    
    const operation = event.fieldName || event.operation || 'unknown';
    // ✅ Track business logic: Handler start
    monitoring.trackOperation('HANDLER_START', 'Handler', operation, { operation });

    try {
        // All logic is wrapped in try...finally to ensure metrics are flushed
        const service = new VenueAssignmentService();
        
        // Handle GraphQL field resolvers
        if (event.fieldName) {
            switch (event.fieldName) {
                case 'assignVenueToGame':
                    const { gameId, venueId } = event.arguments;
                    const result = await service.assignVenueToGame(gameId, venueId);
                    return {
                        success: result.success,
                        gameId: gameId,
                        venueId: venueId,
                        affectedRecords: result.transaction.affectedRecords,
                        error: result.error
                    };
                    
                case 'batchAssignVenues':
                    const { assignments } = event.arguments;
                    const batchResults = await service.batchAssignVenues(assignments);
                    const successful = batchResults.filter(r => r.success);
                    const failed = batchResults.filter(r => !r.success);
                    return {
                        successful,
                        failed,
                        totalProcessed: batchResults.length
                    };
                    
                case 'listGamesNeedingVenue':
                    const { limit, nextToken } = event.arguments || {};
                    return await service.getGamesNeedingVenue(limit, nextToken);
                    
                case 'getVenueAssignmentSummary':
                    return await service.getVenueAssignmentSummary();
                    
                default:
                    throw new Error(`Unknown field: ${event.fieldName}`);
            }
        }
        
        // Handle direct Lambda invocation
        switch (event.operation) {
            case 'assignVenue':
                return await service.assignVenueToGame(
                    event.gameId,
                    event.venueId,
                    event.options
                );
                
            case 'batchAssign':
                return await service.batchAssignVenues(event.assignments);
                
            case 'getGamesNeedingVenue':
                return await service.getGamesNeedingVenue(event.limit, event.nextToken);
                
            case 'getSummary':
                return await service.getVenueAssignmentSummary();
                
            default:
                throw new Error(`Unknown operation: ${event.operation}`);
        }
    } catch (error) {
        // ✅ Track business logic: A fatal error occurred in the handler
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', { error: error.message, operationName: operation });
        throw error;
    } finally {
        // Always flush metrics before the Lambda exits
        if (monitoring) {
            console.log('[VenueAssignmentService] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[VenueAssignmentService] Monitoring flush complete.');
        }
    }
};