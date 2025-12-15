// src/services/recurringGameService.ts
import { generateClient } from 'aws-amplify/api';
import { 
    createRecurringGame, 
    updateRecurringGame, 
} from '../graphql/mutations';
import type { RecurringGame, CreateRecurringGameInput, UpdateRecurringGameInput } from '../API';

// ============================================================================
// COMPOSITE KEY HELPER
// ============================================================================

/**
 * Build the composite sort key for the byVenueRecurringGame GSI.
 * This key is CRITICAL for the recurring game resolver to find candidates.
 * 
 * Format: "DAYOFWEEK#GameName" (e.g., "TUESDAY#Tuesday Night NLHE")
 * 
 * Without this key, records won't appear in GSI queries and matching will fail.
 */
const buildDayOfWeekNameKey = (dayOfWeek: string | undefined | null, name: string | undefined | null): string | null => {
    if (!dayOfWeek || !name) {
        console.warn('[RecurringGameService] Cannot build composite key: missing dayOfWeek or name', { dayOfWeek, name });
        return null;
    }
    return `${dayOfWeek}#${name}`;
};

// ============================================================================
// CUSTOM QUERIES
// ============================================================================

// ✅ Custom query with explicit field selection (fixes the entityId filter issue)
// ✅ Added tournamentType for resolver scoring
const listRecurringGamesQuery = /* GraphQL */ `
    query ListRecurringGames($filter: ModelRecurringGameFilterInput, $limit: Int, $nextToken: String) {
        listRecurringGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                displayName
                description
                aliases
                entityId
                venueId
                dayOfWeek
                startTime
                endTime
                frequency
                gameType
                gameVariant
                tournamentType
                typicalBuyIn
                typicalRake
                typicalStartingStack
                typicalGuarantee
                isActive
                isPaused
                pausedReason
                lastGameDate
                nextScheduledDate
                isSignature
                isBeginnerFriendly
                isBounty
                tags
                autoDetectionConfidence
                wasManuallyCreated
                requiresReview
                totalInstancesRun
                avgAttendance
                notes
                adminNotes
                createdAt
                updatedAt
                venue {
                    id
                    name
                }
                entity {
                    id
                    entityName
                }
            }
            nextToken
        }
    }
`;

// Query to fetch a single recurring game by ID (for updates)
const getRecurringGameQuery = /* GraphQL */ `
    query GetRecurringGame($id: ID!) {
        getRecurringGame(id: $id) {
            id
            name
            dayOfWeek
        }
    }
`;

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

// ✅ Lazy client initialization to avoid "Amplify not configured" warning
let _client: any = null;
const getClient = () => {
    if (!_client) {
        _client = generateClient();
    }
    return _client;
};

// ============================================================================
// FETCH OPERATIONS
// ============================================================================

export const fetchRecurringGames = async (entityId: string): Promise<RecurringGame[]> => {
    try {
        const response = await getClient().graphql({
            query: listRecurringGamesQuery,
            variables: {
                filter: {
                    entityId: { eq: entityId }
                },
                limit: 1000
            }
        }) as any;
        return response.data.listRecurringGames.items;
    } catch (error) {
        console.error('Error fetching recurring games:', error);
        throw error;
    }
};

/**
 * Fetch a single recurring game by ID
 * Used internally for updates to get current name/dayOfWeek values
 */
const fetchRecurringGameById = async (id: string): Promise<{ id: string; name: string; dayOfWeek: string } | null> => {
    try {
        const response = await getClient().graphql({
            query: getRecurringGameQuery,
            variables: { id }
        }) as any;
        return response.data.getRecurringGame;
    } catch (error) {
        console.error('Error fetching recurring game by ID:', error);
        return null;
    }
};

// ============================================================================
// CREATE OPERATION
// ============================================================================

/**
 * Create a new recurring game with computed composite key.
 * 
 * IMPORTANT: This function computes the `dayOfWeek#name` composite key
 * which is required for the GSI query in the recurring game resolver.
 */
export const createNewRecurringGame = async (input: CreateRecurringGameInput): Promise<RecurringGame> => {
    // Validate required fields for composite key
    if (!input.dayOfWeek) {
        throw new Error('dayOfWeek is required to create a recurring game');
    }
    if (!input.name) {
        throw new Error('name is required to create a recurring game');
    }
    
    // Compute the composite key for the GSI
    const compositeKey = buildDayOfWeekNameKey(input.dayOfWeek, input.name);
    
    if (!compositeKey) {
        throw new Error('Failed to build composite key for recurring game');
    }
    
    // Build enriched input with composite key
    // Note: Cast to any because 'dayOfWeek#name' is a DynamoDB composite key
    // that exists in the table but isn't in the generated GraphQL types
    const enrichedInput: any = {
        ...input,
        'dayOfWeek#name': compositeKey
    };
    
    console.log('[RecurringGameService] Creating recurring game:', {
        name: input.name,
        dayOfWeek: input.dayOfWeek,
        venueId: input.venueId,
        compositeKey
    });
    
    try {
        const response = await getClient().graphql({
            query: createRecurringGame,
            variables: { input: enrichedInput }
        }) as any;
        
        console.log('[RecurringGameService] Created recurring game:', response.data.createRecurringGame.id);
        return response.data.createRecurringGame;
    } catch (error) {
        console.error('Error creating recurring game:', error);
        throw error;
    }
};

// ============================================================================
// UPDATE OPERATION
// ============================================================================

/**
 * Update an existing recurring game.
 * 
 * IMPORTANT: If name or dayOfWeek changes, this function will:
 * 1. Fetch the current record to get existing values
 * 2. Recompute the `dayOfWeek#name` composite key
 * 
 * This ensures the GSI stays in sync with the data.
 */
export const updateExistingRecurringGame = async (input: UpdateRecurringGameInput): Promise<RecurringGame> => {
    if (!input.id) {
        throw new Error('id is required to update a recurring game');
    }
    
    // Note: Cast to any because 'dayOfWeek#name' is a DynamoDB composite key
    // that exists in the table but isn't in the generated GraphQL types
    let enrichedInput: any = { ...input };
    
    // Check if we need to recompute the composite key
    const needsKeyRecompute = input.name !== undefined || input.dayOfWeek !== undefined;
    
    if (needsKeyRecompute) {
        // Fetch current record to get existing values
        const currentRecord = await fetchRecurringGameById(input.id);
        
        if (!currentRecord) {
            console.warn('[RecurringGameService] Could not fetch current record for composite key update');
            // Proceed without recomputing - the record might have been deleted
        } else {
            // Use new values if provided, otherwise fall back to current values
            const finalName = input.name ?? currentRecord.name;
            const finalDayOfWeek = input.dayOfWeek ?? currentRecord.dayOfWeek;
            
            const compositeKey = buildDayOfWeekNameKey(finalDayOfWeek, finalName);
            
            if (compositeKey) {
                enrichedInput['dayOfWeek#name'] = compositeKey;
                
                console.log('[RecurringGameService] Recomputed composite key:', {
                    id: input.id,
                    oldName: currentRecord.name,
                    newName: finalName,
                    oldDayOfWeek: currentRecord.dayOfWeek,
                    newDayOfWeek: finalDayOfWeek,
                    compositeKey
                });
            }
        }
    }
    
    try {
        const response = await getClient().graphql({
            query: updateRecurringGame,
            variables: { input: enrichedInput }
        }) as any;
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error updating recurring game:', error);
        throw error;
    }
};

// ============================================================================
// DEACTIVATE OPERATION
// ============================================================================

/**
 * Deactivate a recurring game.
 * Sets isActive to false and optionally adds a reason to notes.
 */
export const deactivateGame = async (id: string, reason?: string): Promise<RecurringGame> => {
    try {
        const response = await getClient().graphql({
            query: updateRecurringGame,
            variables: { 
                input: { 
                    id, 
                    isActive: false,
                    notes: reason ? `Deactivated: ${reason}` : undefined
                } 
            }
        }) as any;
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error deactivating recurring game:', error);
        throw error;
    }
};

// ============================================================================
// UTILITY: BACKFILL MISSING COMPOSITE KEYS
// ============================================================================

/**
 * Utility function to fix existing records that are missing the composite key.
 * 
 * Call this once to backfill records that were created before the fix:
 * 
 * ```typescript
 * const games = await fetchRecurringGames(entityId);
 * await backfillMissingCompositeKeys(games);
 * ```
 */
export const backfillMissingCompositeKeys = async (games: RecurringGame[]): Promise<{
    fixed: number;
    skipped: number;
    errors: string[];
}> => {
    const results = { fixed: 0, skipped: 0, errors: [] as string[] };
    
    for (const game of games) {
        // Check if composite key is missing or empty
        const existingKey = (game as any)['dayOfWeek#name'];
        
        if (existingKey) {
            results.skipped++;
            continue;
        }
        
        // Need to fix this record
        if (!game.dayOfWeek || !game.name) {
            results.errors.push(`Game ${game.id} missing dayOfWeek or name - cannot fix`);
            continue;
        }
        
        const compositeKey = buildDayOfWeekNameKey(game.dayOfWeek, game.name);
        
        if (!compositeKey) {
            results.errors.push(`Game ${game.id} failed to build composite key`);
            continue;
        }
        
        try {
            // Cast input to any because 'dayOfWeek#name' isn't in generated types
            const updateInput: any = {
                id: game.id,
                'dayOfWeek#name': compositeKey
            };
            
            await getClient().graphql({
                query: updateRecurringGame,
                variables: { input: updateInput }
            });
            
            console.log(`[Backfill] Fixed game ${game.id}: ${compositeKey}`);
            results.fixed++;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.errors.push(`Game ${game.id}: ${message}`);
        }
    }
    
    console.log('[Backfill] Complete:', results);
    return results;
};