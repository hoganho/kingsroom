/**
 * PLAYER CONSOLIDATION LOGIC MODULE
 * 
 * Handles player data consolidation for multi-day tournaments.
 * Works alongside tournament consolidation to prevent double-counting
 * of buy-ins, games played, and financial metrics.
 * 
 * KEY CONCEPTS:
 * - Initial Entry: First time player enters the tournament
 * - Re-entry: Player busted and bought in again (costs money)
 * - Qualified Continuation: Player survived previous day (no additional cost)
 * - Direct Buy-in: Player enters on Day 2+ without playing Day 1 (costs money)
 * 
 * INTEGRATION POINT:
 * Call `consolidatePlayerDataForTournament(parentId, children)` 
 * after recalculateParentTotals() in the tournament consolidator.
 */

const { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// CONSTANTS
// ===================================================================

const EntryType = {
    INITIAL: 'INITIAL',
    REENTRY: 'REENTRY',
    DIRECT_BUYIN: 'DIRECT_BUYIN',
    QUALIFIED_CONTINUATION: 'QUALIFIED_CONTINUATION',
    AGGREGATE_LISTING: 'AGGREGATE_LISTING' // For the parent tournament
};

const RecordType = {
    ORIGINAL: 'ORIGINAL',
    CONSOLIDATED: 'CONSOLIDATED',
    SUPERSEDED: 'SUPERSEDED' // Original record that's been consolidated
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Fetches all items with pagination support
 */
const fetchAllItems = async (ddbDocClient, params) => {
    let items = [];
    let lastEvaluatedKey = undefined;
    
    do {
        const response = await ddbDocClient.send(new QueryCommand({
            ...params,
            ExclusiveStartKey: lastEvaluatedKey
        }));
        
        if (response.Items) items = items.concat(response.Items);
        lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return items;
};

/**
 * Determines if an entry represents a player who survived to continue
 * vs. someone who busted and re-entered
 */
const didPlayerSurvive = (entry) => {
    // Survived if status is COMPLETED or QUALIFIED, not ELIMINATED
    return entry.status === 'COMPLETED' || 
           entry.isMultiDayQualification === true ||
           (entry.status !== 'ELIMINATED' && entry.lastKnownStackSize > 0);
};

/**
 * Sorts child games chronologically
 */
const sortChildrenChronologically = (children) => {
    return [...children].sort((a, b) => 
        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
    );
};

// ===================================================================
// CORE CONSOLIDATION LOGIC
// ===================================================================

/**
 * Builds a comprehensive player journey map across all flights/days
 * 
 * @param {Object} ddbDocClient - DynamoDB Document Client
 * @param {string} playerEntryTable - PlayerEntry table name
 * @param {Array} sortedChildren - Child games sorted chronologically
 * @returns {Map<string, Object>} Map of playerId to their tournament journey
 */
const buildPlayerJourneyMap = async (ddbDocClient, playerEntryTable, sortedChildren) => {
    const playerJourneys = new Map();
    
    for (let gameIndex = 0; gameIndex < sortedChildren.length; gameIndex++) {
        const game = sortedChildren[gameIndex];
        const isDay1 = game.dayNumber === 1 || gameIndex === 0;
        const isFlight = !!game.flightLetter;
        const isFinalDay = game.finalDay === true;
        
        // Fetch all entries for this game
        const entries = await fetchAllItems(ddbDocClient, {
            TableName: playerEntryTable,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gid',
            ExpressionAttributeValues: { ':gid': game.id }
        });
        
        for (const entry of entries) {
            const playerId = entry.playerId;
            let journey = playerJourneys.get(playerId);
            
            if (!journey) {
                journey = {
                    playerId,
                    firstEntryId: entry.id,
                    firstGameId: game.id,
                    firstEntryDate: game.gameStartDateTime,
                    entries: [],
                    buyInCount: 0,           // Actual monetary buy-ins
                    continuationCount: 0,     // Qualified continuations (no cost)
                    finalResult: null,        // The actual tournament result
                    totalAmountPaid: 0,       // Total buy-ins + rebuys paid
                    amountWon: 0,
                    finalRank: null,
                    survivedToEnd: false,
                    lastGameId: null,
                    lastEntryDate: null
                };
                playerJourneys.set(playerId, journey);
            }
            
            // Determine entry classification
            let entryClassification;
            let isBuyIn = false;
            
            if (journey.entries.length === 0) {
                // First appearance in this tournament
                if (!isDay1 && !isFlight) {
                    // Entered on Day 2+ directly (skipped Day 1)
                    entryClassification = EntryType.DIRECT_BUYIN;
                    isBuyIn = true;
                } else {
                    // Normal first entry
                    entryClassification = EntryType.INITIAL;
                    isBuyIn = true;
                }
            } else {
                // Player has previous entries in this tournament
                const lastEntry = journey.entries[journey.entries.length - 1];
                
                if (lastEntry.survived) {
                    // Survived previous day/flight - continuing
                    entryClassification = EntryType.QUALIFIED_CONTINUATION;
                    isBuyIn = false; // No additional buy-in for qualified continuation
                } else {
                    // Busted in previous entry - this is a re-entry
                    entryClassification = EntryType.REENTRY;
                    isBuyIn = true;
                }
            }
            
            // Did they survive this flight/day?
            const survived = didPlayerSurvive(entry);
            
            // Track the entry
            journey.entries.push({
                entryId: entry.id,
                gameId: game.id,
                gameName: game.name,
                gameStartDateTime: game.gameStartDateTime,
                dayNumber: game.dayNumber,
                flightLetter: game.flightLetter,
                isFinalDay,
                classification: entryClassification,
                isBuyIn,
                survived,
                originalStatus: entry.status,
                buyInAmount: isBuyIn ? (game.buyIn || 0) + (game.rake || 0) : 0
            });
            
            // Update journey totals
            if (isBuyIn) {
                journey.buyInCount++;
                journey.totalAmountPaid += (game.buyIn || 0) + (game.rake || 0);
            } else {
                journey.continuationCount++;
            }
            
            journey.lastGameId = game.id;
            journey.lastEntryDate = game.gameStartDateTime;
            journey.survivedToEnd = survived && isFinalDay;
        }
    }
    
    return playerJourneys;
};

/**
 * Fetches and attaches final results to player journeys
 * 
 * @param {Object} ddbDocClient - DynamoDB Document Client
 * @param {string} playerResultTable - PlayerResult table name
 * @param {Array} sortedChildren - Child games sorted chronologically
 * @param {Map} playerJourneys - Player journey map
 */
const attachFinalResults = async (ddbDocClient, playerResultTable, sortedChildren, playerJourneys) => {
    // Find the final day game
    const finalDayGame = sortedChildren.find(g => g.finalDay === true) || 
                         sortedChildren[sortedChildren.length - 1];
    
    if (!finalDayGame) return;
    
    // Fetch results from final day
    const finalResults = await fetchAllItems(ddbDocClient, {
        TableName: playerResultTable,
        IndexName: 'byGame',
        KeyConditionExpression: 'gameId = :gid',
        ExpressionAttributeValues: { ':gid': finalDayGame.id }
    });
    
    for (const result of finalResults) {
        const journey = playerJourneys.get(result.playerId);
        if (journey) {
            journey.finalResult = result;
            journey.amountWon = result.amountWon || 0;
            journey.finalRank = result.finishingPlace;
            
            // Mark if they cashed or qualified
            if (result.amountWon > 0 || result.isMultiDayQualification) {
                journey.survivedToEnd = true;
            }
        }
    }
};

/**
 * Calculates the net profit/loss for a player's tournament journey
 */
const calculateNetProfitLoss = (journey) => {
    return journey.amountWon - journey.totalAmountPaid;
};

/**
 * Determines what adjustments need to be made to player statistics
 * 
 * @param {Object} journey - Player's tournament journey
 * @returns {Object} Adjustments to apply
 */
const calculateStatAdjustments = (journey) => {
    // The player participated in ONE tournament, not multiple
    // We need to subtract the over-counted amounts
    
    const totalEntriesRecorded = journey.entries.length;
    const actualBuyInEvents = journey.buyInCount; // Initial + reentries + direct buy-ins
    
    // Over-counting happened for:
    // - tournamentsPlayed: recorded (entries.length) times, should be 1
    // - totalBuyIns: recorded for each entry, should only count actual buy-ins
    // - sessionsPlayed: similar issue
    
    return {
        // How many extra "games" were counted
        overCountedGames: totalEntriesRecorded - 1,
        
        // How many extra "buy-ins" were counted
        overCountedBuyIns: totalEntriesRecorded - actualBuyInEvents,
        
        // The amount that was over-counted in buy-in totals
        overCountedBuyInAmount: journey.entries
            .filter(e => !e.isBuyIn)
            .reduce((sum, e) => {
                // Find the game's buy-in from entries
                const originalBuyIn = journey.entries.find(x => x.gameId === e.gameId && x.isBuyIn);
                return sum + (originalBuyIn ? originalBuyIn.buyInAmount : 0);
            }, 0),
        
        // Whether this player had multiple flights on the same day (shouldn't affect games count)
        hadMultipleFlights: journey.entries.filter(e => e.flightLetter).length > 1,
        
        // Total entries to track (for PlayerVenue)
        actualBuyInEvents,
        totalEntriesRecorded
    };
};

// ===================================================================
// DATABASE UPDATE FUNCTIONS
// ===================================================================

/**
 * Updates PlayerEntry records with correct entryType classification
 */
const updatePlayerEntryClassifications = async (ddbDocClient, playerEntryTable, playerJourneys) => {
    const updates = [];
    const now = new Date().toISOString();
    
    for (const [playerId, journey] of playerJourneys) {
        for (const entry of journey.entries) {
            updates.push({
                entryId: entry.entryId,
                entryType: entry.classification,
                isMultiDayTournament: true
            });
        }
    }
    
    // Batch update entries
    for (const update of updates) {
        try {
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerEntryTable,
                Key: { id: update.entryId },
                UpdateExpression: 'SET entryType = :et, isMultiDayTournament = :mdt, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':et': update.entryType,
                    ':mdt': update.isMultiDayTournament,
                    ':now': now
                }
            }));
        } catch (error) {
            console.warn(`[PlayerConsolidation] Failed to update entry ${update.entryId}:`, error.message);
        }
    }
    
    return updates.length;
};

/**
 * Creates consolidated PlayerResult on parent game
 * Marks child results as SUPERSEDED
 */
const consolidatePlayerResults = async (ddbDocClient, playerResultTable, parentGameId, parentGame, playerJourneys) => {
    const now = new Date().toISOString();
    const consolidatedResults = [];
    
    for (const [playerId, journey] of playerJourneys) {
        // Skip if no final result
        if (!journey.finalResult && !journey.amountWon) continue;
        
        const consolidatedResultId = `${playerId}#${parentGameId}`;
        const netProfitLoss = calculateNetProfitLoss(journey);
        
        const consolidatedResult = {
            id: consolidatedResultId,
            playerId: playerId,
            gameId: parentGameId,
            venueId: parentGame.venueId,
            entityId: parentGame.entityId,
            finishingPlace: journey.finalRank,
            prizeWon: journey.amountWon > 0 || journey.survivedToEnd,
            amountWon: journey.amountWon || 0,
            pointsEarned: journey.finalResult?.pointsEarned || 0,
            totalRunners: parentGame.totalUniquePlayers || parentGame.actualCalculatedUniquePlayers,
            gameStartDateTime: parentGame.gameStartDateTime,
            recordType: RecordType.CONSOLIDATED,
            // Consolidation metadata
            isConsolidatedRecord: true,
            sourceEntryCount: journey.entries.length,
            sourceBuyInCount: journey.buyInCount,
            totalBuyInsPaid: journey.totalAmountPaid,
            netProfitLoss: netProfitLoss,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'PlayerResult'
        };
        
        try {
            await ddbDocClient.send(new PutCommand({
                TableName: playerResultTable,
                Item: consolidatedResult,
                ConditionExpression: 'attribute_not_exists(id)'
            }));
            consolidatedResults.push(consolidatedResultId);
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') {
                console.warn(`[PlayerConsolidation] Failed to create consolidated result for ${playerId}:`, error.message);
            }
        }
        
        // Mark original child results as SUPERSEDED
        for (const entry of journey.entries) {
            const childResultId = `${playerId}#${entry.gameId}`;
            try {
                await ddbDocClient.send(new UpdateCommand({
                    TableName: playerResultTable,
                    Key: { id: childResultId },
                    UpdateExpression: 'SET recordType = :rt, consolidatedIntoGameId = :pid, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':rt': RecordType.SUPERSEDED,
                        ':pid': parentGameId,
                        ':now': now
                    },
                    ConditionExpression: 'attribute_exists(id)'
                }));
            } catch (error) {
                // Ignore if doesn't exist
            }
        }
    }
    
    return consolidatedResults.length;
};

/**
 * Creates aggregate PlayerEntry on parent game
 * This represents the player's overall tournament participation
 */
const createAggregateEntries = async (ddbDocClient, playerEntryTable, parentGameId, parentGame, playerJourneys) => {
    const now = new Date().toISOString();
    let created = 0;
    
    for (const [playerId, journey] of playerJourneys) {
        const aggregateEntryId = `${parentGameId}#${playerId}`;
        
        const aggregateEntry = {
            id: aggregateEntryId,
            playerId: playerId,
            gameId: parentGameId,
            venueId: parentGame.venueId,
            entityId: parentGame.entityId,
            status: journey.survivedToEnd ? 'COMPLETED' : 'ELIMINATED',
            registrationTime: journey.firstEntryDate,
            gameStartDateTime: parentGame.gameStartDateTime,
            isMultiDayTournament: true,
            entryType: EntryType.AGGREGATE_LISTING,
            recordType: RecordType.CONSOLIDATED,
            // Aggregated data
            numberOfReEntries: Math.max(0, journey.buyInCount - 1),
            totalFlightsPlayed: journey.entries.length,
            sourceChildGameIds: journey.entries.map(e => e.gameId),
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'PlayerEntry'
        };
        
        try {
            await ddbDocClient.send(new PutCommand({
                TableName: playerEntryTable,
                Item: aggregateEntry,
                ConditionExpression: 'attribute_not_exists(id)'
            }));
            created++;
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') {
                console.warn(`[PlayerConsolidation] Failed to create aggregate entry for ${playerId}:`, error.message);
            }
        }
    }
    
    return created;
};

/**
 * Generates adjustment records for PlayerSummary and PlayerVenue
 * These will be processed by a separate adjustment Lambda or stored for review
 */
const generateStatAdjustments = (playerJourneys) => {
    const adjustments = [];
    
    for (const [playerId, journey] of playerJourneys) {
        const stats = calculateStatAdjustments(journey);
        
        // Only generate adjustment if there's actual over-counting
        if (stats.overCountedGames > 0 || stats.overCountedBuyIns > 0) {
            adjustments.push({
                playerId,
                // PlayerSummary adjustments
                summaryAdjustments: {
                    tournamentsPlayed: -stats.overCountedGames,
                    sessionsPlayed: -stats.overCountedGames,
                    totalBuyIns: -stats.overCountedBuyInAmount,
                    tournamentBuyIns: -stats.overCountedBuyInAmount,
                    // Net balance correction: over-counted buy-ins need to be added back
                    netBalance: stats.overCountedBuyInAmount
                },
                // PlayerVenue adjustments (per venue)
                venueAdjustments: {
                    totalGamesPlayed: -stats.overCountedGames,
                    totalBuyIns: -stats.overCountedBuyInAmount,
                    netProfit: stats.overCountedBuyInAmount
                },
                // Metadata
                metadata: {
                    originalEntriesCount: stats.totalEntriesRecorded,
                    actualBuyInEvents: stats.actualBuyInEvents,
                    hadMultipleFlights: stats.hadMultipleFlights,
                    journeyDetails: journey.entries.map(e => ({
                        gameId: e.gameId,
                        classification: e.classification,
                        isBuyIn: e.isBuyIn
                    }))
                }
            });
        }
    }
    
    return adjustments;
};

/**
 * Applies stat adjustments to PlayerSummary
 */
const applyPlayerSummaryAdjustments = async (ddbDocClient, playerSummaryTable, adjustments) => {
    const now = new Date().toISOString();
    let applied = 0;
    
    for (const adj of adjustments) {
        try {
            // Build dynamic update expression
            const updates = [];
            const values = {};
            
            for (const [field, value] of Object.entries(adj.summaryAdjustments)) {
                if (value !== 0) {
                    updates.push(`${field} = ${field} + :adj_${field}`);
                    values[`:adj_${field}`] = value;
                }
            }
            
            if (updates.length === 0) continue;
            
            values[':now'] = now;
            
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerSummaryTable,
                Key: { id: adj.playerId },
                UpdateExpression: `SET ${updates.join(', ')}, updatedAt = :now, lastConsolidationAt = :now`,
                ExpressionAttributeValues: values,
                ConditionExpression: 'attribute_exists(id)'
            }));
            
            applied++;
        } catch (error) {
            console.warn(`[PlayerConsolidation] Failed to adjust summary for ${adj.playerId}:`, error.message);
        }
    }
    
    return applied;
};

/**
 * Applies stat adjustments to PlayerVenue records
 */
const applyPlayerVenueAdjustments = async (ddbDocClient, playerVenueTable, adjustments, venueId, entityId) => {
    const now = new Date().toISOString();
    let applied = 0;
    
    for (const adj of adjustments) {
        // Find the PlayerVenue record for this player at this venue
        const visityKey = `${adj.playerId}#${entityId}#${venueId}`;
        
        try {
            // Try to find by visityKey first
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: playerVenueTable,
                IndexName: 'byVisitKey',
                KeyConditionExpression: 'visityKey = :vk',
                ExpressionAttributeValues: { ':vk': visityKey }
            }));
            
            const playerVenue = queryResult.Items?.[0];
            if (!playerVenue) continue;
            
            // Build dynamic update expression
            const updates = [];
            const values = {};
            
            for (const [field, value] of Object.entries(adj.venueAdjustments)) {
                if (value !== 0) {
                    updates.push(`${field} = ${field} + :adj_${field}`);
                    values[`:adj_${field}`] = value;
                }
            }
            
            if (updates.length === 0) continue;
            
            values[':now'] = now;
            
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerVenueTable,
                Key: { id: playerVenue.id },
                UpdateExpression: `SET ${updates.join(', ')}, updatedAt = :now`,
                ExpressionAttributeValues: values
            }));
            
            applied++;
        } catch (error) {
            console.warn(`[PlayerConsolidation] Failed to adjust PlayerVenue for ${adj.playerId}:`, error.message);
        }
    }
    
    return applied;
};

// ===================================================================
// MAIN CONSOLIDATION FUNCTION
// ===================================================================

/**
 * Main function to consolidate player data for a multi-day tournament
 * 
 * @param {Object} ddbDocClient - DynamoDB Document Client
 * @param {Object} tableNames - Object containing table names
 * @param {string} parentGameId - The parent game ID
 * @param {Object} parentGame - The parent game record
 * @param {Array} children - Child game records
 * @param {Object} options - Optional configuration
 * @returns {Object} Consolidation results
 */
const consolidatePlayerDataForTournament = async (
    ddbDocClient,
    tableNames,
    parentGameId,
    parentGame,
    children,
    options = {}
) => {
    console.log(`[PlayerConsolidation] Starting consolidation for parent ${parentGameId} with ${children.length} children`);
    
    const {
        applyAdjustments = true,      // Apply stat adjustments to Summary/Venue
        createAggregates = true,       // Create aggregate entries on parent
        consolidateResults = true,     // Create consolidated results on parent
        dryRun = false                 // If true, calculate but don't write
    } = options;
    
    const {
        PlayerEntry: playerEntryTable,
        PlayerResult: playerResultTable,
        PlayerSummary: playerSummaryTable,
        PlayerVenue: playerVenueTable
    } = tableNames;
    
    // Sort children chronologically
    const sortedChildren = sortChildrenChronologically(children);
    
    // Step 1: Build player journey map
    console.log(`[PlayerConsolidation] Building player journey map...`);
    const playerJourneys = await buildPlayerJourneyMap(ddbDocClient, playerEntryTable, sortedChildren);
    console.log(`[PlayerConsolidation] Found ${playerJourneys.size} unique players across all flights`);
    
    // Step 2: Attach final results
    console.log(`[PlayerConsolidation] Attaching final results...`);
    await attachFinalResults(ddbDocClient, playerResultTable, sortedChildren, playerJourneys);
    
    // Step 3: Generate stat adjustments
    console.log(`[PlayerConsolidation] Calculating stat adjustments...`);
    const adjustments = generateStatAdjustments(playerJourneys);
    console.log(`[PlayerConsolidation] Generated ${adjustments.length} adjustment records`);
    
    // Build result object
    const result = {
        parentGameId,
        childCount: children.length,
        uniquePlayers: playerJourneys.size,
        adjustmentsGenerated: adjustments.length,
        dryRun,
        actions: {
            entriesClassified: 0,
            aggregateEntriesCreated: 0,
            resultsConsolidated: 0,
            summariesAdjusted: 0,
            venuesAdjusted: 0
        },
        playerJourneySummary: Array.from(playerJourneys.values()).map(j => ({
            playerId: j.playerId,
            totalEntries: j.entries.length,
            buyInCount: j.buyInCount,
            continuationCount: j.continuationCount,
            totalPaid: j.totalAmountPaid,
            amountWon: j.amountWon,
            netProfitLoss: calculateNetProfitLoss(j),
            finalRank: j.finalRank
        }))
    };
    
    if (dryRun) {
        console.log(`[PlayerConsolidation] Dry run complete - no changes written`);
        result.adjustments = adjustments;
        return result;
    }
    
    // Step 4: Update entry classifications
    console.log(`[PlayerConsolidation] Updating entry classifications...`);
    result.actions.entriesClassified = await updatePlayerEntryClassifications(
        ddbDocClient, playerEntryTable, playerJourneys
    );
    
    // Step 5: Create aggregate entries on parent
    if (createAggregates) {
        console.log(`[PlayerConsolidation] Creating aggregate entries on parent...`);
        result.actions.aggregateEntriesCreated = await createAggregateEntries(
            ddbDocClient, playerEntryTable, parentGameId, parentGame, playerJourneys
        );
    }
    
    // Step 6: Consolidate results to parent
    if (consolidateResults) {
        console.log(`[PlayerConsolidation] Consolidating results to parent...`);
        result.actions.resultsConsolidated = await consolidatePlayerResults(
            ddbDocClient, playerResultTable, parentGameId, parentGame, playerJourneys
        );
    }
    
    // Step 7: Apply stat adjustments
    if (applyAdjustments && adjustments.length > 0) {
        console.log(`[PlayerConsolidation] Applying PlayerSummary adjustments...`);
        result.actions.summariesAdjusted = await applyPlayerSummaryAdjustments(
            ddbDocClient, playerSummaryTable, adjustments
        );
        
        console.log(`[PlayerConsolidation] Applying PlayerVenue adjustments...`);
        result.actions.venuesAdjusted = await applyPlayerVenueAdjustments(
            ddbDocClient, playerVenueTable, adjustments, parentGame.venueId, parentGame.entityId
        );
    }
    
    console.log(`[PlayerConsolidation] Consolidation complete:`, result.actions);
    
    return result;
};

/**
 * Preview consolidation without making changes
 * Useful for the frontend to show what will happen
 */
const previewPlayerConsolidation = async (
    ddbDocClient,
    tableNames,
    parentGameId,
    parentGame,
    children
) => {
    return consolidatePlayerDataForTournament(
        ddbDocClient,
        tableNames,
        parentGameId,
        parentGame,
        children,
        { dryRun: true }
    );
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Main functions
    consolidatePlayerDataForTournament,
    previewPlayerConsolidation,
    
    // Helper functions (exported for testing)
    buildPlayerJourneyMap,
    attachFinalResults,
    calculateStatAdjustments,
    generateStatAdjustments,
    calculateNetProfitLoss,
    
    // Update functions (can be called independently)
    updatePlayerEntryClassifications,
    consolidatePlayerResults,
    createAggregateEntries,
    applyPlayerSummaryAdjustments,
    applyPlayerVenueAdjustments,
    
    // Constants
    EntryType,
    RecordType
};
