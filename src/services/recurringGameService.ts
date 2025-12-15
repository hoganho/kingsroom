// src/services/recurringGameService.ts
import { generateClient } from 'aws-amplify/api';
import { 
    createRecurringGame, 
    updateRecurringGame, 
} from '../graphql/mutations';
import type { RecurringGame, CreateRecurringGameInput, UpdateRecurringGameInput } from '../API';

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

// ============================================================================
// CREATE OPERATION
// ============================================================================

// Fields that are valid for CreateRecurringGameInput
const VALID_CREATE_FIELDS = [
    'name', 'displayName', 'description', 'aliases',
    'entityId', 'venueId',
    'dayOfWeek', 'startTime', 'endTime', 'frequency',
    'gameType', 'gameVariant', 'tournamentType',
    'typicalBuyIn', 'typicalRake', 'typicalStartingStack', 'typicalGuarantee',
    'isActive', 'isPaused', 'pausedReason',
    'isSignature', 'isBeginnerFriendly', 'isBounty', 'tags',
    'marketingDescription', 'imageUrl', 'socialMediaHashtags',
    'autoDetectionConfidence', 'wasManuallyCreated', 'requiresReview',
    'notes', 'adminNotes', 'createdBy'
];

/**
 * Sanitize input to only include valid fields for GraphQL mutation
 */
const sanitizeInput = (input: any, validFields: string[]): any => {
    const sanitized: any = {};
    for (const field of validFields) {
        if (input[field] !== undefined) {
            // Skip empty strings for optional fields
            if (input[field] === '' && field !== 'name') continue;
            // Skip empty arrays
            if (Array.isArray(input[field]) && input[field].length === 0) continue;
            sanitized[field] = input[field];
        }
    }
    return sanitized;
};

/**
 * Create a new recurring game.
 * 
 * Note: The `dayOfWeek#name` composite key is computed automatically by a
 * DynamoDB Stream trigger after the record is created. This ensures the GSI
 * works correctly for the recurring game resolver.
 */
export const createNewRecurringGame = async (input: CreateRecurringGameInput): Promise<RecurringGame> => {
    // Validate required fields
    if (!input.dayOfWeek) {
        throw new Error('dayOfWeek is required to create a recurring game');
    }
    if (!input.name) {
        throw new Error('name is required to create a recurring game');
    }
    
    // Sanitize input to only include valid fields
    const sanitizedInput = sanitizeInput(input, VALID_CREATE_FIELDS);
    
    console.log('[RecurringGameService] Creating recurring game:', {
        name: sanitizedInput.name,
        dayOfWeek: sanitizedInput.dayOfWeek,
        venueId: sanitizedInput.venueId,
    });
    
    try {
        const response = await getClient().graphql({
            query: createRecurringGame,
            variables: { input: sanitizedInput }
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

// Fields that are valid for UpdateRecurringGameInput (same as create + id)
const VALID_UPDATE_FIELDS = ['id', ...VALID_CREATE_FIELDS];

/**
 * Update an existing recurring game.
 * 
 * Note: If name or dayOfWeek changes, the `dayOfWeek#name` composite key
 * is recomputed automatically by a DynamoDB Stream trigger.
 */
export const updateExistingRecurringGame = async (input: UpdateRecurringGameInput): Promise<RecurringGame> => {
    if (!input.id) {
        throw new Error('id is required to update a recurring game');
    }
    
    // Sanitize input to only include valid fields
    const sanitizedInput = sanitizeInput(input, VALID_UPDATE_FIELDS);
    // Ensure id is always included
    sanitizedInput.id = input.id;
    
    try {
        const response = await getClient().graphql({
            query: updateRecurringGame,
            variables: { input: sanitizedInput }
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