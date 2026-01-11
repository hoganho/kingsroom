// scheduleOps.ts
// Schedule operations for recurring game gap detection, compliance, and reconciliation

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

import {
  DetectGapsInput,
  DetectGapsResult,
  GapInfo,
  ReconcileInstancesInput,
  ReconcileInstancesResult,
  ReconcileAction,
  VenueComplianceReportInput,
  VenueComplianceReport,
  RecurringGameCompliance,
  RecordMissedInstanceInput,
  RecordMissedInstanceResult,
  RecurringGameRecord,
  RecurringGameInstanceRecord,
  GameRecord,
  CreateInstanceInput,
  UpdateInstanceInput,
} from './scheduleTypes';

import {
  calculateExpectedDates,
  getWeekKey,
  isSameDay,
  extractDateFromDateTime,
  calculateConsecutiveMisses,
  formatDate,
  parseDate,
} from './dateCalculations';

// ===================================================================
// DYNAMODB SETUP
// ===================================================================

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Table names from environment
const RECURRING_GAME_TABLE = process.env.API_POKERPROLIVE_RECURRINGGAMETABLE_NAME!;
const RECURRING_GAME_INSTANCE_TABLE = process.env.API_POKERPROLIVE_RECURRINGGAMEINSTANCETABLE_NAME!;
const GAME_TABLE = process.env.API_POKERPROLIVE_GAMETABLE_NAME!;
const VENUE_TABLE = process.env.API_POKERPROLIVE_VENUETABLE_NAME!;

// ===================================================================
// DATABASE HELPERS
// ===================================================================

/**
 * Get all active recurring games for a venue
 */
async function getRecurringGamesByVenue(
  venueId: string,
  activeOnly: boolean = true
): Promise<RecurringGameRecord[]> {
  const params: QueryCommandInput = {
    TableName: RECURRING_GAME_TABLE,
    IndexName: 'byVenueRecurringGame',
    KeyConditionExpression: 'venueId = :venueId',
    ExpressionAttributeValues: {
      ':venueId': venueId,
    },
  };

  if (activeOnly) {
    params.FilterExpression = 'isActive = :isActive';
    params.ExpressionAttributeValues![':isActive'] = true;
  }

  const allItems: RecurringGameRecord[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await docClient.send(new QueryCommand(params));
    if (result.Items) {
      allItems.push(...(result.Items as RecurringGameRecord[]));
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

/**
 * Get a single recurring game by ID
 */
async function getRecurringGameById(id: string): Promise<RecurringGameRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: RECURRING_GAME_TABLE,
      Key: { id },
    })
  );
  return (result.Item as RecurringGameRecord) || null;
}

/**
 * Get recurring game instances for a venue within a date range
 */
async function getInstancesByVenue(
  venueId: string,
  startDate: string,
  endDate: string
): Promise<RecurringGameInstanceRecord[]> {
  const params: QueryCommandInput = {
    TableName: RECURRING_GAME_INSTANCE_TABLE,
    IndexName: 'byVenueInstance',
    KeyConditionExpression: 'venueId = :venueId AND expectedDate BETWEEN :startDate AND :endDate',
    ExpressionAttributeValues: {
      ':venueId': venueId,
      ':startDate': startDate,
      ':endDate': endDate,
    },
  };

  const allItems: RecurringGameInstanceRecord[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await docClient.send(new QueryCommand(params));
    if (result.Items) {
      allItems.push(...(result.Items as RecurringGameInstanceRecord[]));
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

/**
 * Get instances for a specific recurring game within a date range
 */
async function getInstancesByRecurringGame(
  recurringGameId: string,
  startDate: string,
  endDate: string
): Promise<RecurringGameInstanceRecord[]> {
  const params: QueryCommandInput = {
    TableName: RECURRING_GAME_INSTANCE_TABLE,
    IndexName: 'byRecurringGameInstance',
    KeyConditionExpression:
      'recurringGameId = :recurringGameId AND expectedDate BETWEEN :startDate AND :endDate',
    ExpressionAttributeValues: {
      ':recurringGameId': recurringGameId,
      ':startDate': startDate,
      ':endDate': endDate,
    },
  };

  const result = await docClient.send(new QueryCommand(params));
  return (result.Items as RecurringGameInstanceRecord[]) || [];
}

/**
 * Find an instance by recurring game ID and expected date
 */
async function findInstance(
  recurringGameId: string,
  expectedDate: string
): Promise<RecurringGameInstanceRecord | null> {
  const params: QueryCommandInput = {
    TableName: RECURRING_GAME_INSTANCE_TABLE,
    IndexName: 'byRecurringGameInstance',
    KeyConditionExpression: 'recurringGameId = :recurringGameId AND expectedDate = :expectedDate',
    ExpressionAttributeValues: {
      ':recurringGameId': recurringGameId,
      ':expectedDate': expectedDate,
    },
  };

  const result = await docClient.send(new QueryCommand(params));
  return result.Items && result.Items.length > 0
    ? (result.Items[0] as RecurringGameInstanceRecord)
    : null;
}

/**
 * Get games for a venue within a date range
 */
async function getGamesByVenue(
  venueId: string,
  startDate: string,
  endDate: string
): Promise<GameRecord[]> {
  // Convert dates to datetime format for the query
  const startDateTime = `${startDate}T00:00:00.000Z`;
  const endDateTime = `${endDate}T23:59:59.999Z`;

  const params: QueryCommandInput = {
    TableName: GAME_TABLE,
    IndexName: 'byVenue',
    KeyConditionExpression:
      'venueId = :venueId AND gameStartDateTime BETWEEN :startDateTime AND :endDateTime',
    ExpressionAttributeValues: {
      ':venueId': venueId,
      ':startDateTime': startDateTime,
      ':endDateTime': endDateTime,
    },
  };

  const allItems: GameRecord[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await docClient.send(new QueryCommand(params));
    if (result.Items) {
      allItems.push(...(result.Items as GameRecord[]));
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

/**
 * Get venue name by ID
 */
async function getVenueName(venueId: string): Promise<string | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: VENUE_TABLE,
      Key: { id: venueId },
      ProjectionExpression: '#n',
      ExpressionAttributeNames: { '#n': 'name' },
    })
  );
  return result.Item?.name;
}

/**
 * Create a new recurring game instance
 */
async function createInstance(input: CreateInstanceInput): Promise<RecurringGameInstanceRecord> {
  const now = new Date().toISOString();
  const instance: RecurringGameInstanceRecord = {
    id: uuidv4(),
    recurringGameId: input.recurringGameId,
    gameId: input.gameId,
    expectedDate: input.expectedDate,
    dayOfWeek: input.dayOfWeek,
    weekKey: input.weekKey,
    venueId: input.venueId,
    entityId: input.entityId,
    recurringGameName: input.recurringGameName,
    status: input.status,
    cancellationReason: input.cancellationReason,
    adminNotes: input.adminNotes,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: RECURRING_GAME_INSTANCE_TABLE,
      Item: instance,
    })
  );

  return instance;
}

/**
 * Update an existing instance
 */
async function updateInstance(
  instanceId: string,
  updates: UpdateInstanceInput
): Promise<void> {
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttributeValues: Record<string, any> = {
    ':updatedAt': new Date().toISOString(),
  };

  if (updates.gameId !== undefined) {
    updateExpressions.push('gameId = :gameId');
    expressionAttributeValues[':gameId'] = updates.gameId;
  }

  if (updates.status !== undefined) {
    updateExpressions.push('#status = :status');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = updates.status;
  }

  if (updates.cancellationReason !== undefined) {
    updateExpressions.push('cancellationReason = :cancellationReason');
    expressionAttributeValues[':cancellationReason'] = updates.cancellationReason;
  }

  if (updates.adminNotes !== undefined) {
    updateExpressions.push('adminNotes = :adminNotes');
    expressionAttributeValues[':adminNotes'] = updates.adminNotes;
  }

  if (updates.hasDeviation !== undefined) {
    updateExpressions.push('hasDeviation = :hasDeviation');
    expressionAttributeValues[':hasDeviation'] = updates.hasDeviation;
  }

  if (updates.deviationType !== undefined) {
    updateExpressions.push('deviationType = :deviationType');
    expressionAttributeValues[':deviationType'] = updates.deviationType;
  }

  if (updates.deviationDetails !== undefined) {
    updateExpressions.push('deviationDetails = :deviationDetails');
    expressionAttributeValues[':deviationDetails'] = updates.deviationDetails;
  }

  if (updates.needsReview !== undefined) {
    updateExpressions.push('needsReview = :needsReview');
    expressionAttributeValues[':needsReview'] = updates.needsReview;
  }

  if (updates.reviewReason !== undefined) {
    updateExpressions.push('reviewReason = :reviewReason');
    expressionAttributeValues[':reviewReason'] = updates.reviewReason;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: RECURRING_GAME_INSTANCE_TABLE,
      Key: { id: instanceId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

// ===================================================================
// MAIN OPERATIONS
// ===================================================================

/**
 * Detect gaps in recurring game schedule
 * Finds dates where a recurring game was expected but no instance exists
 */
export async function detectRecurringGameGaps(
  input: DetectGapsInput
): Promise<DetectGapsResult> {
  const { venueId, startDate, endDate, createInstances = false } = input;

  try {
    console.log(`[detectRecurringGameGaps] Starting for venue ${venueId}, range ${startDate} to ${endDate}`);

    // 1. Get all active recurring games for the venue
    const recurringGames = await getRecurringGamesByVenue(venueId, true);
    console.log(`[detectRecurringGameGaps] Found ${recurringGames.length} active recurring games`);

    if (recurringGames.length === 0) {
      return {
        success: true,
        venueId,
        startDate,
        endDate,
        recurringGamesChecked: 0,
        totalExpectedInstances: 0,
        gapsFound: 0,
        gaps: [],
        instancesCreated: createInstances ? 0 : undefined,
      };
    }

    // 2. Get all existing instances for the venue in the date range
    const existingInstances = await getInstancesByVenue(venueId, startDate, endDate);
    console.log(`[detectRecurringGameGaps] Found ${existingInstances.length} existing instances`);

    // Build a lookup map: recurringGameId + expectedDate -> instance
    const instanceMap = new Map<string, RecurringGameInstanceRecord>();
    for (const instance of existingInstances) {
      const key = `${instance.recurringGameId}|${instance.expectedDate}`;
      instanceMap.set(key, instance);
    }

    // 3. For each recurring game, calculate expected dates and find gaps
    const gaps: GapInfo[] = [];
    let totalExpectedInstances = 0;
    let instancesCreated = 0;

    for (const rg of recurringGames) {
      // Skip games without a day of week
      if (!rg.dayOfWeek) {
        console.log(`[detectRecurringGameGaps] Skipping ${rg.id} - no dayOfWeek`);
        continue;
      }

      const expectedDates = calculateExpectedDates(rg, startDate, endDate);
      totalExpectedInstances += expectedDates.length;

      for (const date of expectedDates) {
        const key = `${rg.id}|${date}`;
        
        if (!instanceMap.has(key)) {
          // This is a gap
          const gapInfo: GapInfo = {
            recurringGameId: rg.id,
            recurringGameName: rg.displayName || rg.name,
            venueId: rg.venueId,
            expectedDate: date,
            dayOfWeek: rg.dayOfWeek,
            weekKey: getWeekKey(date),
          };
          gaps.push(gapInfo);

          // Optionally create UNKNOWN instances for gaps
          if (createInstances) {
            await createInstance({
              recurringGameId: rg.id,
              expectedDate: date,
              dayOfWeek: rg.dayOfWeek,
              weekKey: getWeekKey(date),
              venueId: rg.venueId,
              entityId: rg.entityId,
              recurringGameName: rg.displayName || rg.name,
              status: 'UNKNOWN',
            });
            instancesCreated++;
          }
        }
      }
    }

    console.log(`[detectRecurringGameGaps] Found ${gaps.length} gaps, created ${instancesCreated} instances`);

    return {
      success: true,
      venueId,
      startDate,
      endDate,
      recurringGamesChecked: recurringGames.length,
      totalExpectedInstances,
      gapsFound: gaps.length,
      gaps,
      instancesCreated: createInstances ? instancesCreated : undefined,
    };
  } catch (error: any) {
    console.error('[detectRecurringGameGaps] Error:', error);
    return {
      success: false,
      venueId,
      startDate,
      endDate,
      recurringGamesChecked: 0,
      totalExpectedInstances: 0,
      gapsFound: 0,
      gaps: [],
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get venue compliance report
 * Generates metrics for all recurring games at a venue
 */
export async function getVenueComplianceReport(
  input: VenueComplianceReportInput
): Promise<VenueComplianceReport> {
  const { venueId, startDate, endDate } = input;

  try {
    console.log(`[getVenueComplianceReport] Starting for venue ${venueId}`);

    // Get venue name
    const venueName = await getVenueName(venueId);

    // Get all recurring games (including inactive for historical compliance)
    const recurringGames = await getRecurringGamesByVenue(venueId, false);
    console.log(`[getVenueComplianceReport] Found ${recurringGames.length} recurring games`);

    if (recurringGames.length === 0) {
      return {
        success: true,
        venueId,
        venueName,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
        totalRecurringGames: 0,
        totalExpected: 0,
        totalConfirmed: 0,
        totalCancelled: 0,
        totalSkipped: 0,
        totalUnknown: 0,
        overallComplianceRate: 1,
        gameCompliance: [],
        gamesWithLowCompliance: [],
        gamesWithConsecutiveMisses: [],
      };
    }

    // Get all instances in date range
    const instances = await getInstancesByVenue(venueId, startDate, endDate);
    console.log(`[getVenueComplianceReport] Found ${instances.length} instances`);

    // Group instances by recurring game
    const instancesByGame = new Map<string, RecurringGameInstanceRecord[]>();
    for (const instance of instances) {
      const existing = instancesByGame.get(instance.recurringGameId) || [];
      existing.push(instance);
      instancesByGame.set(instance.recurringGameId, existing);
    }

    // Calculate per-game compliance
    const gameCompliance: RecurringGameCompliance[] = [];
    let totalExpected = 0;
    let totalConfirmed = 0;
    let totalCancelled = 0;
    let totalSkipped = 0;
    let totalUnknown = 0;

    for (const rg of recurringGames) {
      if (!rg.dayOfWeek) continue;

      const gameInstances = instancesByGame.get(rg.id) || [];
      const expectedDates = calculateExpectedDates(rg, startDate, endDate);
      const expectedCount = expectedDates.length;

      if (expectedCount === 0) continue;

      // Count by status
      const confirmed = gameInstances.filter((i) => i.status === 'CONFIRMED').length;
      const cancelled = gameInstances.filter((i) => i.status === 'CANCELLED').length;
      const skipped = gameInstances.filter((i) => i.status === 'SKIPPED').length;
      const noShow = gameInstances.filter((i) => i.status === 'NO_SHOW').length;
      const unknown = gameInstances.filter((i) => i.status === 'UNKNOWN').length;
      
      // Missing instances (no record at all) count as unknown
      const missingCount = expectedCount - gameInstances.length;
      const totalUnknownForGame = unknown + Math.max(0, missingCount);

      // Find last confirmed and cancelled dates
      const confirmedInstances = gameInstances.filter((i) => i.status === 'CONFIRMED');
      const cancelledInstances = gameInstances.filter((i) => i.status === 'CANCELLED');
      
      const lastConfirmedDate = confirmedInstances.length > 0
        ? confirmedInstances.sort((a, b) => b.expectedDate.localeCompare(a.expectedDate))[0].expectedDate
        : undefined;
      
      const lastCancelledDate = cancelledInstances.length > 0
        ? cancelledInstances.sort((a, b) => b.expectedDate.localeCompare(a.expectedDate))[0].expectedDate
        : undefined;

      // Calculate consecutive misses
      const consecutiveMisses = calculateConsecutiveMisses(
        gameInstances.map((i) => ({ expectedDate: i.expectedDate, status: i.status })),
        rg.dayOfWeek
      );

      const complianceRate = expectedCount > 0 ? confirmed / expectedCount : 0;

      const compliance: RecurringGameCompliance = {
        recurringGameId: rg.id,
        recurringGameName: rg.displayName || rg.name,
        dayOfWeek: rg.dayOfWeek,
        frequency: rg.frequency,
        expectedInstances: expectedCount,
        confirmedInstances: confirmed,
        cancelledInstances: cancelled + noShow,
        skippedInstances: skipped,
        unknownInstances: totalUnknownForGame,
        complianceRate,
        lastConfirmedDate,
        lastCancelledDate,
        consecutiveMisses,
      };

      gameCompliance.push(compliance);

      // Update totals
      totalExpected += expectedCount;
      totalConfirmed += confirmed;
      totalCancelled += cancelled + noShow;
      totalSkipped += skipped;
      totalUnknown += totalUnknownForGame;
    }

    // Sort by compliance rate ascending (worst first)
    gameCompliance.sort((a, b) => a.complianceRate - b.complianceRate);

    // Identify problem games
    const LOW_COMPLIANCE_THRESHOLD = 0.8;
    const gamesWithLowCompliance = gameCompliance.filter(
      (gc) => gc.complianceRate < LOW_COMPLIANCE_THRESHOLD && gc.expectedInstances >= 2
    );
    const gamesWithConsecutiveMisses = gameCompliance.filter((gc) => gc.consecutiveMisses >= 2);

    const overallComplianceRate = totalExpected > 0 ? totalConfirmed / totalExpected : 1;

    return {
      success: true,
      venueId,
      venueName,
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      totalRecurringGames: recurringGames.length,
      totalExpected,
      totalConfirmed,
      totalCancelled,
      totalSkipped,
      totalUnknown,
      overallComplianceRate,
      gameCompliance,
      gamesWithLowCompliance,
      gamesWithConsecutiveMisses,
    };
  } catch (error: any) {
    console.error('[getVenueComplianceReport] Error:', error);
    return {
      success: false,
      venueId,
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      totalRecurringGames: 0,
      totalExpected: 0,
      totalConfirmed: 0,
      totalCancelled: 0,
      totalSkipped: 0,
      totalUnknown: 0,
      overallComplianceRate: 0,
      gameCompliance: [],
      gamesWithLowCompliance: [],
      gamesWithConsecutiveMisses: [],
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Reconcile recurring instances
 * Matches existing games to expected instances and fills gaps
 */
export async function reconcileRecurringInstances(
  input: ReconcileInstancesInput
): Promise<ReconcileInstancesResult> {
  const { venueId, startDate, endDate, preview = true } = input;

  try {
    console.log(`[reconcileRecurringInstances] Starting for venue ${venueId}, preview=${preview}`);

    // 1. Get all active recurring games
    const recurringGames = await getRecurringGamesByVenue(venueId, true);
    console.log(`[reconcileRecurringInstances] Found ${recurringGames.length} active recurring games`);

    // 2. Get all games in date range
    const games = await getGamesByVenue(venueId, startDate, endDate);
    console.log(`[reconcileRecurringInstances] Found ${games.length} games`);

    // 3. Get existing instances
    const existingInstances = await getInstancesByVenue(venueId, startDate, endDate);
    console.log(`[reconcileRecurringInstances] Found ${existingInstances.length} existing instances`);

    // Build lookup maps
    const instanceMap = new Map<string, RecurringGameInstanceRecord>();
    for (const instance of existingInstances) {
      const key = `${instance.recurringGameId}|${instance.expectedDate}`;
      instanceMap.set(key, instance);
    }

    // Group games by recurring game ID and date
    const gamesByRecurringAndDate = new Map<string, GameRecord[]>();
    for (const game of games) {
      if (!game.recurringGameId) continue;
      const gameDate = extractDateFromDateTime(game.gameStartDateTime);
      const key = `${game.recurringGameId}|${gameDate}`;
      const existing = gamesByRecurringAndDate.get(key) || [];
      existing.push(game);
      gamesByRecurringAndDate.set(key, existing);
    }

    const actions: ReconcileAction[] = [];
    let totalExpectedInstances = 0;
    let existingInstancesFound = 0;
    let gamesMatchedToInstances = 0;
    let newInstancesCreated = 0;
    let orphanedGamesFound = 0;

    // 4. Process each recurring game
    for (const rg of recurringGames) {
      if (!rg.dayOfWeek) continue;

      const expectedDates = calculateExpectedDates(rg, startDate, endDate);
      totalExpectedInstances += expectedDates.length;

      for (const date of expectedDates) {
        const instanceKey = `${rg.id}|${date}`;
        const existingInstance = instanceMap.get(instanceKey);
        const matchingGames = gamesByRecurringAndDate.get(instanceKey) || [];
        const matchingGame = matchingGames[0]; // Take first if multiple

        if (existingInstance) {
          existingInstancesFound++;

          // Check if we need to link a game to this instance
          if (matchingGame && !existingInstance.gameId) {
            actions.push({
              recurringGameId: rg.id,
              recurringGameName: rg.displayName || rg.name,
              expectedDate: date,
              action: 'LINK_GAME',
              gameId: matchingGame.id,
              gameName: matchingGame.name,
              status: 'CONFIRMED',
              details: 'Linking existing game to instance',
            });

            if (!preview) {
              await updateInstance(existingInstance.id, {
                gameId: matchingGame.id,
                status: 'CONFIRMED',
              });
            }
            gamesMatchedToInstances++;
          } else if (existingInstance.status === 'UNKNOWN' && !matchingGame) {
            // Instance marked as unknown and still no game - keep as is
            actions.push({
              recurringGameId: rg.id,
              recurringGameName: rg.displayName || rg.name,
              expectedDate: date,
              action: 'NO_CHANGE',
              status: existingInstance.status,
              details: 'Instance exists, no matching game found',
            });
          }
        } else {
          // No existing instance - create one
          if (matchingGame) {
            // Create confirmed instance linked to game
            actions.push({
              recurringGameId: rg.id,
              recurringGameName: rg.displayName || rg.name,
              expectedDate: date,
              action: 'CREATE_CONFIRMED',
              gameId: matchingGame.id,
              gameName: matchingGame.name,
              status: 'CONFIRMED',
              details: 'Creating confirmed instance for existing game',
            });

            if (!preview) {
              await createInstance({
                recurringGameId: rg.id,
                gameId: matchingGame.id,
                expectedDate: date,
                dayOfWeek: rg.dayOfWeek,
                weekKey: getWeekKey(date),
                venueId: rg.venueId,
                entityId: rg.entityId,
                recurringGameName: rg.displayName || rg.name,
                status: 'CONFIRMED',
              });
            }
            newInstancesCreated++;
            gamesMatchedToInstances++;
          } else {
            // No game found - create unknown instance
            actions.push({
              recurringGameId: rg.id,
              recurringGameName: rg.displayName || rg.name,
              expectedDate: date,
              action: 'CREATE_UNKNOWN',
              status: 'UNKNOWN',
              details: 'No matching game found for expected date',
            });

            if (!preview) {
              await createInstance({
                recurringGameId: rg.id,
                expectedDate: date,
                dayOfWeek: rg.dayOfWeek,
                weekKey: getWeekKey(date),
                venueId: rg.venueId,
                entityId: rg.entityId,
                recurringGameName: rg.displayName || rg.name,
                status: 'UNKNOWN',
              });
            }
            newInstancesCreated++;
          }
        }
      }
    }

    // 5. Find orphaned games (games with recurringGameId that don't match any expected date)
    const assignedGames = games.filter((g) => g.recurringGameId);
    for (const game of assignedGames) {
      const gameDate = extractDateFromDateTime(game.gameStartDateTime);
      const rg = recurringGames.find((r) => r.id === game.recurringGameId);
      
      if (rg) {
        const expectedDates = calculateExpectedDates(rg, startDate, endDate);
        const isExpected = expectedDates.includes(gameDate);
        
        if (!isExpected) {
          orphanedGamesFound++;
          actions.push({
            recurringGameId: game.recurringGameId!,
            recurringGameName: rg.displayName || rg.name,
            expectedDate: gameDate,
            action: 'ORPHANED_GAME',
            gameId: game.id,
            gameName: game.name,
            details: 'Game date does not match expected schedule',
          });
        }
      }
    }

    console.log(
      `[reconcileRecurringInstances] Complete. Actions: ${actions.length}, Created: ${newInstancesCreated}`
    );

    return {
      success: true,
      venueId,
      startDate,
      endDate,
      preview,
      recurringGamesProcessed: recurringGames.length,
      totalExpectedInstances,
      existingInstancesFound,
      gamesMatchedToInstances,
      newInstancesCreated: preview ? 0 : newInstancesCreated,
      orphanedGamesFound,
      actions,
    };
  } catch (error: any) {
    console.error('[reconcileRecurringInstances] Error:', error);
    return {
      success: false,
      venueId,
      startDate,
      endDate,
      preview,
      recurringGamesProcessed: 0,
      totalExpectedInstances: 0,
      existingInstancesFound: 0,
      gamesMatchedToInstances: 0,
      newInstancesCreated: 0,
      orphanedGamesFound: 0,
      actions: [],
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Record a missed instance (cancelled, skipped, no-show)
 */
export async function recordMissedInstance(
  input: RecordMissedInstanceInput
): Promise<RecordMissedInstanceResult> {
  const { recurringGameId, expectedDate, status, reason, adminNotes } = input;

  try {
    console.log(`[recordMissedInstance] Recording ${status} for ${recurringGameId} on ${expectedDate}`);

    // 1. Get the recurring game details
    const rg = await getRecurringGameById(recurringGameId);
    if (!rg) {
      return {
        success: false,
        recurringGameId,
        expectedDate,
        status,
        wasCreated: false,
        error: `Recurring game not found: ${recurringGameId}`,
      };
    }

    // 2. Check if an instance already exists
    const existingInstance = await findInstance(recurringGameId, expectedDate);

    if (existingInstance) {
      // Update existing instance
      await updateInstance(existingInstance.id, {
        status,
        cancellationReason: reason,
        adminNotes,
      });

      console.log(`[recordMissedInstance] Updated existing instance ${existingInstance.id}`);

      return {
        success: true,
        instanceId: existingInstance.id,
        recurringGameId,
        expectedDate,
        status,
        wasCreated: false,
      };
    } else {
      // Create new instance
      const newInstance = await createInstance({
        recurringGameId,
        expectedDate,
        dayOfWeek: rg.dayOfWeek,
        weekKey: getWeekKey(expectedDate),
        venueId: rg.venueId,
        entityId: rg.entityId,
        recurringGameName: rg.displayName || rg.name,
        status,
        cancellationReason: reason,
        adminNotes,
      });

      console.log(`[recordMissedInstance] Created new instance ${newInstance.id}`);

      return {
        success: true,
        instanceId: newInstance.id,
        recurringGameId,
        expectedDate,
        status,
        wasCreated: true,
      };
    }
  } catch (error: any) {
    console.error('[recordMissedInstance] Error:', error);
    return {
      success: false,
      recurringGameId,
      expectedDate,
      status,
      wasCreated: false,
      error: error.message || 'Unknown error',
    };
  }
}
