// src/services/recurringGameService.ts
// UPDATED: Added deduplication check and day-of-week validation
import { generateClient } from 'aws-amplify/api';
import type { RecurringGame, CreateRecurringGameInput, UpdateRecurringGameInput } from '../API';

// ============================================================================
// CUSTOM MUTATIONS WITH DATASTORE SYNC FIELDS
// ============================================================================

const createRecurringGameMutation = /* GraphQL */ `
    mutation CreateRecurringGame($input: CreateRecurringGameInput!) {
        createRecurringGame(input: $input) {
            id
            name
            displayName
            entityId
            venueId
            dayOfWeek
            startTime
            frequency
            gameType
            gameVariant
            typicalBuyIn
            typicalGuarantee
            isActive
            wasManuallyCreated
            _version
            _lastChangedAt
            createdAt
            updatedAt
        }
    }
`;

const updateRecurringGameMutation = /* GraphQL */ `
    mutation UpdateRecurringGame($input: UpdateRecurringGameInput!) {
        updateRecurringGame(input: $input) {
            id
            name
            displayName
            entityId
            venueId
            dayOfWeek
            startTime
            frequency
            gameType
            gameVariant
            typicalBuyIn
            typicalGuarantee
            isActive
            wasManuallyCreated
            _version
            _lastChangedAt
            createdAt
            updatedAt
        }
    }
`;

// ============================================================================
// CUSTOM QUERIES - Lightweight, no nested relationships
// ============================================================================

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
                isSignature
                isBeginnerFriendly
                isBounty
                tags
                wasManuallyCreated
                requiresReview
                totalInstancesRun
                notes
                adminNotes
                _version
                _lastChangedAt
                createdAt
                updatedAt
            }
            nextToken
        }
    }
`;

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
const getClient = () => {
    if (!_client) {
        _client = generateClient();
    }
    return _client;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_KEYWORDS: Record<string, string> = {
    'monday': 'MONDAY',
    'mon': 'MONDAY',
    'tuesday': 'TUESDAY',
    'tue': 'TUESDAY',
    'tues': 'TUESDAY',
    'wednesday': 'WEDNESDAY',
    'wed': 'WEDNESDAY',
    'thursday': 'THURSDAY',
    'thu': 'THURSDAY',
    'thur': 'THURSDAY',
    'thurs': 'THURSDAY',
    'friday': 'FRIDAY',
    'fri': 'FRIDAY',
    'saturday': 'SATURDAY',
    'sat': 'SATURDAY',
    'sunday': 'SUNDAY',
    'sun': 'SUNDAY',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize game name for comparison
 * Strips dollar amounts, GTD text, and special characters
 */
const normalizeGameName = (name: string): string => {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)?/gi, '')
        .replace(/\b(gtd|guaranteed)\b/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Extract day hint from game name
 * E.g., "FRIDAY SHOT CLOCK" → "FRIDAY"
 */
export const extractDayFromName = (name: string): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase();
    
    for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
        // Match whole words only
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(lower)) {
            return day;
        }
    }
    return null;
};

/**
 * Check if name and dayOfWeek are consistent
 * Returns warning if mismatch detected
 */
export const validateDayConsistency = (name: string, dayOfWeek: string): { 
    isValid: boolean; 
    warning?: string;
    suggestedDay?: string;
} => {
    const dayHint = extractDayFromName(name);
    
    if (dayHint && dayHint !== dayOfWeek) {
        return {
            isValid: false,
            warning: `Game name "${name}" suggests ${dayHint}, but ${dayOfWeek} was selected.`,
            suggestedDay: dayHint
        };
    }
    
    return { isValid: true };
};

/**
 * Calculate similarity score between two strings (0-1)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = normalizeGameName(str1);
    const s2 = normalizeGameName(str2);
    
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;
    
    // Simple Jaccard similarity on words
    const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(s2.split(' ').filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
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
        }) as { data: { listRecurringGames: { items: RecurringGame[] } } };
        return response.data.listRecurringGames.items;
    } catch (error) {
        console.error('Error fetching recurring games:', error);
        throw error;
    }
};

/**
 * Fetch recurring games by venue (for deduplication checks)
 */
export const fetchRecurringGamesByVenue = async (venueId: string): Promise<RecurringGame[]> => {
    try {
        const response = await getClient().graphql({
            query: listRecurringGamesQuery,
            variables: {
                filter: {
                    venueId: { eq: venueId },
                    isActive: { eq: true }
                },
                limit: 100
            }
        }) as { data: { listRecurringGames: { items: RecurringGame[] } } };
        return response.data.listRecurringGames.items || [];
    } catch (error) {
        console.error('Error fetching recurring games by venue:', error);
        return [];
    }
};

// ============================================================================
// DEDUPLICATION CHECK
// ============================================================================

export interface DuplicateCheckResult {
    hasDuplicate: boolean;
    duplicateId?: string;
    duplicateName?: string;
    similarity?: number;
    dayMismatch?: boolean;
    suggestion?: string;
}

/**
 * Check if a similar recurring game already exists
 * Returns info about potential duplicates
 */
export const checkForDuplicates = async (
    venueId: string,
    name: string,
    dayOfWeek: string,
    gameVariant?: string
): Promise<DuplicateCheckResult> => {
    const existingGames = await fetchRecurringGamesByVenue(venueId);
    
    if (existingGames.length === 0) {
        return { hasDuplicate: false };
    }
    
    const normalizedInput = normalizeGameName(name);
    
    for (const existing of existingGames) {
        const normalizedExisting = normalizeGameName(existing.name);
        const similarity = calculateSimilarity(name, existing.name);
        
        // Exact normalized name match
        if (normalizedInput === normalizedExisting) {
            // Same name, same day = definite duplicate
            if (existing.dayOfWeek === dayOfWeek) {
                return {
                    hasDuplicate: true,
                    duplicateId: existing.id,
                    duplicateName: existing.name,
                    similarity: 1.0,
                    dayMismatch: false,
                    suggestion: `A recurring game with this name already exists for ${dayOfWeek}. Consider editing the existing one instead.`
                };
            }
            
            // Same name, different day = likely user error (e.g., "FRIDAY SHOT CLOCK" on MONDAY)
            return {
                hasDuplicate: true,
                duplicateId: existing.id,
                duplicateName: existing.name,
                similarity: 1.0,
                dayMismatch: true,
                suggestion: `"${existing.name}" already exists on ${existing.dayOfWeek}. Are you sure you want to create it again on ${dayOfWeek}?`
            };
        }
        
        // High similarity match (>80%)
        if (similarity > 0.8) {
            // Check game variant match
            const variantMatch = !gameVariant || !existing.gameVariant || 
                                  gameVariant === existing.gameVariant;
            
            if (variantMatch) {
                return {
                    hasDuplicate: true,
                    duplicateId: existing.id,
                    duplicateName: existing.name,
                    similarity,
                    dayMismatch: existing.dayOfWeek !== dayOfWeek,
                    suggestion: `Similar game "${existing.name}" already exists on ${existing.dayOfWeek}. Similarity: ${Math.round(similarity * 100)}%`
                };
            }
        }
    }
    
    return { hasDuplicate: false };
};

// ============================================================================
// CREATE OPERATION
// ============================================================================

const VALID_CREATE_FIELDS = [
    'name', 'displayName', 'description', 'aliases',
    'entityId', 'venueId',
    'dayOfWeek', 'startTime', 'endTime', 'frequency',
    'gameType', 'gameVariant', 'tournamentType',
    'typicalBuyIn', 'typicalRake', 'typicalStartingStack', 'typicalGuarantee',
    'isActive', 'isPaused', 'pausedReason',
    'isSignature', 'isBeginnerFriendly', 'isBounty', 'tags',
    'wasManuallyCreated', 'requiresReview',
    'notes', 'adminNotes', 'createdBy'
];

const sanitizeInput = (input: Record<string, unknown>, validFields: string[]): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = {};
    for (const field of validFields) {
        if (input[field] !== undefined) {
            if (input[field] === '' && field !== 'name') continue;
            if (Array.isArray(input[field]) && (input[field] as unknown[]).length === 0) continue;
            sanitized[field] = input[field];
        }
    }
    return sanitized;
};

export interface CreateRecurringGameResult {
    success: boolean;
    recurringGame?: RecurringGame;
    error?: string;
    duplicateWarning?: DuplicateCheckResult;
    dayWarning?: string;
}

/**
 * Create a new recurring game with validation and deduplication checks
 */
export const createNewRecurringGame = async (
    input: CreateRecurringGameInput,
    options: { skipDuplicateCheck?: boolean; skipDayCheck?: boolean } = {}
): Promise<RecurringGame> => {
    // Validate required fields
    if (!input.dayOfWeek) {
        throw new Error('dayOfWeek is required');
    }
    if (!input.name) {
        throw new Error('name is required');
    }
    if (!input.venueId) {
        throw new Error('venueId is required');
    }
    
    // Check day consistency (e.g., "FRIDAY SHOT CLOCK" on MONDAY)
    if (!options.skipDayCheck) {
        const dayCheck = validateDayConsistency(input.name, input.dayOfWeek);
        if (!dayCheck.isValid) {
            console.warn('[RecurringGameService] Day mismatch warning:', dayCheck.warning);
            // Don't throw - just warn. The UI should confirm with user.
        }
    }
    
    // Check for duplicates
    if (!options.skipDuplicateCheck && input.venueId) {
        const duplicateCheck = await checkForDuplicates(
            input.venueId,
            input.name,
            input.dayOfWeek,
            input.gameVariant as string | undefined
        );
        
        if (duplicateCheck.hasDuplicate) {
            console.warn('[RecurringGameService] Potential duplicate detected:', duplicateCheck);
            throw new Error(
                `Potential duplicate: ${duplicateCheck.suggestion || 'Similar recurring game already exists.'}`
            );
        }
    }
    
    const sanitizedInput = sanitizeInput(input as Record<string, unknown>, VALID_CREATE_FIELDS);
    
    console.log('[RecurringGameService] Creating recurring game:', {
        name: sanitizedInput.name,
        dayOfWeek: sanitizedInput.dayOfWeek,
        venueId: sanitizedInput.venueId,
    });
    
    try {
        const response = await getClient().graphql({
            query: createRecurringGameMutation,
            variables: { input: sanitizedInput }
        }) as { data: { createRecurringGame: RecurringGame } };
        
        const created = response.data.createRecurringGame;
        console.log('[RecurringGameService] Created:', created.id);
        
        return created;
    } catch (error) {
        console.error('Error creating recurring game:', error);
        throw error;
    }
};

// ============================================================================
// UPDATE OPERATION
// ============================================================================

const VALID_UPDATE_FIELDS = ['id', ...VALID_CREATE_FIELDS, '_version'];

export const updateExistingRecurringGame = async (input: UpdateRecurringGameInput): Promise<RecurringGame> => {
    if (!input.id) {
        throw new Error('id is required');
    }
    
    const sanitizedInput = sanitizeInput(input as Record<string, unknown>, VALID_UPDATE_FIELDS);
    sanitizedInput.id = input.id;
    
    // If name or dayOfWeek is changing, validate consistency
    if (input.name && input.dayOfWeek) {
        const dayCheck = validateDayConsistency(input.name, input.dayOfWeek);
        if (!dayCheck.isValid) {
            console.warn('[RecurringGameService] Day mismatch on update:', dayCheck.warning);
        }
    }
    
    try {
        const response = await getClient().graphql({
            query: updateRecurringGameMutation,
            variables: { input: sanitizedInput }
        }) as { data: { updateRecurringGame: RecurringGame } };
        
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error updating recurring game:', error);
        throw error;
    }
};

// ============================================================================
// DEACTIVATE OPERATION
// ============================================================================

export const deactivateGame = async (id: string, reason?: string): Promise<RecurringGame> => {
    try {
        const response = await getClient().graphql({
            query: updateRecurringGameMutation,
            variables: { 
                input: { 
                    id, 
                    isActive: false,
                    notes: reason ? `Deactivated: ${reason}` : undefined
                } 
            }
        }) as { data: { updateRecurringGame: RecurringGame } };
        
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error deactivating recurring game:', error);
        throw error;
    }
};