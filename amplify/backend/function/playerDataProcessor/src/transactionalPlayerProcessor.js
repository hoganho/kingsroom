/**
 * Transactional Player Processing
 * 
 * VERSION: 1.0.0
 * 
 * This module provides atomic "all-or-nothing" player data processing.
 * Either ALL records are created (PlayerResult, PlayerVenue, PlayerSummary, 
 * PlayerTransactions, PlayerEntry) or NONE of them are.
 * 
 * Uses DynamoDB TransactWriteItems for atomic multi-table writes.
 * 
 * USAGE:
 * Replace the existing processPlayer() function call with:
 *   await processPlayerTransactional(playerData, gameData, ctx);
 * 
 * REQUIREMENTS:
 * - @aws-sdk/lib-dynamodb with TransactWriteCommand
 * - Pre-existing helper functions from playerDataProcessor
 */

const { TransactWriteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// TRANSACTIONAL PLAYER PROCESSOR
// ===================================================================

/**
 * Process a single player with atomic all-or-nothing guarantees.
 * 
 * @param {Object} playerData - Player data from scraped results
 * @param {Object} gameData - Game context including game info and players
 * @param {Object} ctx - Context with dependencies
 * @returns {Object} Result with success status
 */
const processPlayerTransactional = async (playerData, gameData, ctx) => {
    const {
        ddbDocClient,
        getTableName,
        generatePlayerId,
        resolveEntityId,
        calculatePlayerVenueTargetingClassification,
        generateVisitKey,
        findPlayerVenueByVisitKey,
        getVenueInfo,
        monitoring,
        UNASSIGNED_VENUE_ID
    } = ctx;
    
    const playerName = playerData.name;
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Resolve entity and player IDs
    const entityId = resolveEntityId(
        gameData.game.entityId,
        null,
        `processPlayerTransactional(${playerName})`
    );
    const playerId = generatePlayerId(playerName);
    
    console.log(`[TXN-PROCESS] Starting transactional processing for ${playerName} (${playerId})`);
    
    // Table names
    const playerResultTable = getTableName('PlayerResult');
    const playerVenueTable = getTableName('PlayerVenue');
    const playerSummaryTable = getTableName('PlayerSummary');
    const playerTransactionTable = getTableName('PlayerTransaction');
    const playerEntryTable = getTableName('PlayerEntry');
    
    // Record IDs
    const resultId = `${playerId}#${gameData.game.id}`;
    const summaryId = playerId;
    const entryId = `${gameData.game.id}#${playerId}`;
    
    // Game metadata
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime || now;
    const buyInAmount = gameData.game.buyIn || 0;
    const rakeAmount = gameData.game.rake || 0;
    const winningsAmount = playerData.winnings || 0;
    const isITM = winningsAmount > 0 || playerData.isQualification;
    const isCash = winningsAmount > 0;
    
    try {
        // ===============================================================
        // PHASE 1: Pre-fetch existing records (parallel)
        // ===============================================================
        console.log(`[TXN-PROCESS] Phase 1: Pre-fetching existing records...`);
        
        const [existingResult, existingSummary, existingEntry, existingVenue] = await Promise.all([
            // Check PlayerResult
            ddbDocClient.send(new GetCommand({
                TableName: playerResultTable,
                Key: { id: resultId }
            })).then(r => r.Item).catch(() => null),
            
            // Check PlayerSummary
            ddbDocClient.send(new GetCommand({
                TableName: playerSummaryTable,
                Key: { id: summaryId }
            })).then(r => r.Item).catch(() => null),
            
            // Check PlayerEntry
            ddbDocClient.send(new GetCommand({
                TableName: playerEntryTable,
                Key: { id: entryId }
            })).then(r => r.Item).catch(() => null),
            
            // Check PlayerVenue (via helper that handles index lookup)
            (async () => {
                if (!gameData.game.venueId || gameData.game.venueId === UNASSIGNED_VENUE_ID) {
                    return { skip: true };
                }
                const visityKey = generateVisitKey(playerId, entityId, gameData.game.venueId);
                const existing = await findPlayerVenueByVisitKey(visityKey, playerId, gameData.game.venueId);
                return existing || null;
            })()
        ]);
        
        // Skip if PlayerResult already exists (already processed)
        if (existingResult) {
            console.log(`[TXN-PROCESS] PlayerResult already exists for ${playerName}, skipping`);
            return { success: true, playerName, playerId, status: 'ALREADY_EXISTS' };
        }
        
        const skipVenue = existingVenue?.skip === true;
        const wasNewVenue = !existingVenue && !skipVenue;
        
        console.log(`[TXN-PROCESS] Pre-fetch complete:`, {
            existingResult: !!existingResult,
            existingSummary: !!existingSummary,
            existingEntry: !!existingEntry,
            existingVenue: !!existingVenue,
            skipVenue,
            wasNewVenue
        });
        
        // ===============================================================
        // PHASE 2: Build transaction items
        // ===============================================================
        console.log(`[TXN-PROCESS] Phase 2: Building transaction items...`);
        
        const transactItems = [];
        
        // --- 1. PlayerResult (always PUT - we checked it doesn't exist) ---
        transactItems.push({
            Put: {
                TableName: playerResultTable,
                Item: {
                    id: resultId,
                    playerId: playerId,
                    gameId: gameData.game.id,
                    venueId: gameData.game.venueId,
                    entityId: entityId,
                    finishingPlace: playerData.rank || null,
                    prizeWon: isITM,
                    amountWon: winningsAmount,
                    pointsEarned: playerData.points || 0,
                    isMultiDayQualification: playerData.isQualification || false,
                    totalRunners: gameData.game.totalUniquePlayers || gameData.players?.totalUniquePlayers || 0,
                    gameStartDateTime: gameDateTime,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerResult'
                },
                ConditionExpression: 'attribute_not_exists(id)'
            }
        });
        
        // --- 2. PlayerVenue (PUT or UPDATE) ---
        if (!skipVenue) {
            if (existingVenue) {
                // UPDATE existing PlayerVenue
                const gameDateObj = new Date(gameDateTime);
                const currentFirstPlayed = new Date(existingVenue.firstPlayedDate);
                const currentLastPlayed = new Date(existingVenue.lastPlayedDate);
                
                // Calculate new average
                const oldGamesPlayed = existingVenue.totalGamesPlayed || 0;
                const oldAverageBuyIn = existingVenue.averageBuyIn || 0;
                const newTotalGames = oldGamesPlayed + 1;
                const newAverageBuyIn = newTotalGames > 0
                    ? ((oldAverageBuyIn * oldGamesPlayed) + buyInAmount) / newTotalGames
                    : buyInAmount;
                
                let updateExpression = 'SET #version = #version + :inc, updatedAt = :updatedAt, totalGamesPlayed = totalGamesPlayed + :inc, averageBuyIn = :newAverageBuyIn';
                const expressionNames = { '#version': '_version' };
                const expressionValues = {
                    ':inc': 1,
                    ':updatedAt': now,
                    ':newAverageBuyIn': newAverageBuyIn
                };
                
                // Update firstPlayedDate if this game is earlier
                if (gameDateObj < currentFirstPlayed) {
                    updateExpression += ', firstPlayedDate = :firstPlayed';
                    expressionValues[':firstPlayed'] = gameDateTime;
                }
                
                // Update lastPlayedDate if this game is later
                if (gameDateObj > currentLastPlayed) {
                    updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                    expressionValues[':lastPlayed'] = gameDateTime;
                    expressionValues[':targeting'] = calculatePlayerVenueTargetingClassification(
                        gameDateTime,
                        existingVenue.membershipCreatedDate
                    );
                }
                
                transactItems.push({
                    Update: {
                        TableName: playerVenueTable,
                        Key: { id: existingVenue.id },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeNames: expressionNames,
                        ExpressionAttributeValues: expressionValues
                    }
                });
            } else {
                // PUT new PlayerVenue
                const newPlayerVenueId = uuidv4();
                const visityKey = generateVisitKey(playerId, entityId, gameData.game.venueId);
                const targetingClassification = calculatePlayerVenueTargetingClassification(gameDateTime, null);
                
                // Get canonical venue ID if available
                let canonicalVenueId = null;
                try {
                    const venueInfo = await getVenueInfo(gameData.game.venueId);
                    canonicalVenueId = venueInfo?.canonicalVenueId || null;
                } catch (e) {
                    // Ignore - canonicalVenueId is optional
                }
                
                const newPlayerVenue = {
                    id: newPlayerVenueId,
                    playerId: playerId,
                    venueId: gameData.game.venueId,
                    entityId: entityId,
                    visityKey: visityKey,
                    canonicalVenueId: canonicalVenueId,
                    totalGamesPlayed: 1,
                    averageBuyIn: buyInAmount,
                    firstPlayedDate: gameDateTime,
                    lastPlayedDate: gameDateTime,
                    targetingClassification: targetingClassification,
                    membershipStatus: 'NON_MEMBER',
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerVenue'
                };
                
                // Remove null values
                Object.keys(newPlayerVenue).forEach(k => {
                    if (newPlayerVenue[k] === null || newPlayerVenue[k] === undefined) {
                        delete newPlayerVenue[k];
                    }
                });
                
                transactItems.push({
                    Put: {
                        TableName: playerVenueTable,
                        Item: newPlayerVenue
                    }
                });
            }
        }
        
        // --- 3. PlayerSummary (PUT or UPDATE) ---
        if (existingSummary) {
            // UPDATE existing PlayerSummary
            const gameDateObj = new Date(gameDateTime);
            const currentLastPlayed = new Date(existingSummary.lastPlayed);
            
            let updateExpression = `
                SET sessionsPlayed = sessionsPlayed + :one,
                    tournamentsPlayed = tournamentsPlayed + :one,
                    tournamentWinnings = tournamentWinnings + :winnings,
                    tournamentBuyIns = tournamentBuyIns + :buyIn,
                    tournamentITM = tournamentITM + :itm,
                    tournamentsCashed = tournamentsCashed + :cash,
                    totalWinnings = totalWinnings + :winnings,
                    totalBuyIns = totalBuyIns + :buyIn,
                    netBalance = netBalance + :profitLoss,
                    venuesVisited = venuesVisited + :venueInc,
                    updatedAt = :updatedAt,
                    #v = if_not_exists(#v, :zero) + :one,
                    #ent = :entityId
            `;
            const expressionNames = {
                '#v': '_version',
                '#ent': 'entityId'
            };
            const expressionValues = {
                ':one': 1,
                ':winnings': winningsAmount,
                ':buyIn': buyInAmount,
                ':itm': isITM ? 1 : 0,
                ':cash': isCash ? 1 : 0,
                ':profitLoss': winningsAmount - buyInAmount,
                ':venueInc': wasNewVenue ? 1 : 0,
                ':updatedAt': now,
                ':entityId': entityId,
                ':zero': 0
            };
            
            // Only update lastPlayed if this game is later
            if (gameDateObj > currentLastPlayed) {
                updateExpression += ', #lastPlayed = :lastPlayed';
                expressionNames['#lastPlayed'] = 'lastPlayed';
                expressionValues[':lastPlayed'] = gameDateTime;
            }
            
            transactItems.push({
                Update: {
                    TableName: playerSummaryTable,
                    Key: { id: summaryId },
                    UpdateExpression: updateExpression.trim(),
                    ExpressionAttributeNames: expressionNames,
                    ExpressionAttributeValues: expressionValues
                }
            });
        } else {
            // PUT new PlayerSummary
            transactItems.push({
                Put: {
                    TableName: playerSummaryTable,
                    Item: {
                        id: summaryId,
                        playerId: playerId,
                        entityId: entityId,
                        sessionsPlayed: 1,
                        tournamentsPlayed: 1,
                        cashGamesPlayed: 0,
                        venuesVisited: 1,
                        tournamentWinnings: winningsAmount,
                        tournamentBuyIns: buyInAmount,
                        tournamentITM: isITM ? 1 : 0,
                        tournamentsCashed: isCash ? 1 : 0,
                        cashGameWinnings: 0,
                        cashGameBuyIns: 0,
                        totalWinnings: winningsAmount,
                        totalBuyIns: buyInAmount,
                        netBalance: winningsAmount - buyInAmount,
                        lastPlayed: gameDateTime,
                        createdAt: now,
                        updatedAt: now,
                        _version: 1,
                        _lastChangedAt: timestamp,
                        __typename: 'PlayerSummary'
                    }
                }
            });
        }
        
        // --- 4. PlayerTransactions (always PUT) ---
        const transactionsToCreate = [];
        
        // BUY_IN transaction
        if (buyInAmount > 0) {
            transactionsToCreate.push({
                type: 'BUY_IN',
                amount: buyInAmount,
                rake: rakeAmount,
                paymentSource: 'UNKNOWN'
            });
        }
        
        // PRIZE transaction
        if (winningsAmount > 0) {
            transactionsToCreate.push({
                type: 'PRIZE',
                amount: winningsAmount,
                paymentSource: 'POKER_PRIZEPOOL'
            });
        }
        
        // QUALIFICATION transaction
        if (playerData.isQualification) {
            transactionsToCreate.push({
                type: 'QUALIFICATION',
                amount: 0,
                paymentSource: 'UNKNOWN'
            });
        }
        
        for (const txn of transactionsToCreate) {
            const txnItem = {
                id: uuidv4(),
                playerId: playerId,
                venueId: gameData.game.venueId,
                gameId: gameData.game.id,
                entityId: entityId,
                type: txn.type,
                amount: txn.amount,
                paymentSource: txn.paymentSource,
                transactionDate: gameDateTime,
                notes: 'SYSTEM insert from scraped data',
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: timestamp,
                __typename: 'PlayerTransaction'
            };
            
            if (txn.type === 'BUY_IN' && txn.rake) {
                txnItem.rake = txn.rake;
            }
            
            transactItems.push({
                Put: {
                    TableName: playerTransactionTable,
                    Item: txnItem
                }
            });
        }
        
        // --- 5. PlayerEntry (PUT or UPDATE) ---
        if (existingEntry) {
            // UPDATE existing PlayerEntry
            transactItems.push({
                Update: {
                    TableName: playerEntryTable,
                    Key: { id: entryId },
                    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, entityId = :entityId',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':status': 'COMPLETED',
                        ':updatedAt': now,
                        ':entityId': entityId
                    }
                }
            });
        } else {
            // PUT new PlayerEntry
            transactItems.push({
                Put: {
                    TableName: playerEntryTable,
                    Item: {
                        id: entryId,
                        playerId: playerId,
                        gameId: gameData.game.id,
                        venueId: gameData.game.venueId,
                        entityId: entityId,
                        status: 'COMPLETED',
                        registrationTime: gameDateTime,
                        gameStartDateTime: gameDateTime,
                        createdAt: now,
                        updatedAt: now,
                        _version: 1,
                        _lastChangedAt: timestamp,
                        __typename: 'PlayerEntry'
                    }
                }
            });
        }
        
        // ===============================================================
        // PHASE 3: Execute transaction
        // ===============================================================
        console.log(`[TXN-PROCESS] Phase 3: Executing transaction with ${transactItems.length} items...`);
        
        // DynamoDB TransactWriteItems limit is 100 items
        if (transactItems.length > 100) {
            throw new Error(`Transaction too large: ${transactItems.length} items (max 100)`);
        }
        
        await ddbDocClient.send(new TransactWriteCommand({
            TransactItems: transactItems
        }));
        
        console.log(`[TXN-PROCESS] ✅ Transaction SUCCESS for ${playerName} - ${transactItems.length} items committed atomically`);
        
        // Track success
        monitoring?.trackOperation('PLAYER_TXN_COMPLETE', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId,
            itemCount: transactItems.length,
            wasNewVenue
        });
        
        return { 
            success: true, 
            playerName, 
            playerId, 
            entityId, 
            status: 'PROCESSED',
            itemsWritten: transactItems.length
        };
        
    } catch (error) {
        console.error(`[TXN-PROCESS] ❌ Transaction FAILED for ${playerName}:`, error);
        
        // Log specific transaction failure reasons
        if (error.name === 'TransactionCanceledException') {
            console.error(`[TXN-PROCESS] Cancellation reasons:`, error.CancellationReasons);
        }
        
        monitoring?.trackOperation('PLAYER_TXN_ERROR', 'PlayerProcessing', playerName, {
            error: error.message,
            gameId: gameData.game.id,
            entityId
        });
        
        // All-or-nothing: nothing was written
        return { 
            success: false, 
            playerName, 
            entityId, 
            error: error.message,
            status: 'FAILED'
        };
    }
};

// ===================================================================
// INTEGRATION HELPER
// ===================================================================

/**
 * Drop-in replacement for the processPlayer function.
 * 
 * In playerDataProcessor, replace:
 *   const result = await processPlayer(playerData, gameData);
 * 
 * With:
 *   const result = await processPlayerTransactional(playerData, gameData, {
 *       ddbDocClient,
 *       getTableName,
 *       generatePlayerId,
 *       resolveEntityId,
 *       calculatePlayerVenueTargetingClassification,
 *       generateVisitKey,
 *       findPlayerVenueByVisitKey,
 *       getVenueInfo,
 *       monitoring,
 *       UNASSIGNED_VENUE_ID
 *   });
 */

module.exports = {
    processPlayerTransactional
};
