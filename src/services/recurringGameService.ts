// src/services/recurringGameService.ts
// UPDATED: Added deduplication check and day-of-week validation
// UPDATED: Added admin functions for re-resolution, duplicate detection, orphan cleanup
// UPDATED: Added instance tracking for schedule compliance
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
// ADMIN QUERIES & MUTATIONS
// ============================================================================

const getRecurringGameVenueStatsQuery = /* GraphQL */ `
    query GetRecurringGameVenueStats($venueId: ID!) {
        getRecurringGameVenueStats(venueId: $venueId) {
            success
            venueId
            totalRecurringGames
            totalGames
            orphanedRecurringGames
            orphans {
                id
                name
                dayOfWeek
                createdAt
            }
            unassignedGames
            unassignedSample {
                id
                name
                dayOfWeek
            }
            recurringGamesByDay {
                SUNDAY
                MONDAY
                TUESDAY
                WEDNESDAY
                THURSDAY
                FRIDAY
                SATURDAY
            }
            gameDistribution {
                id
                name
                dayOfWeek
                gameCount
            }
        }
    }
`;

const findRecurringGameDuplicatesQuery = /* GraphQL */ `
    query FindRecurringGameDuplicates($venueId: ID!, $similarityThreshold: Float) {
        findRecurringGameDuplicates(venueId: $venueId, similarityThreshold: $similarityThreshold) {
            success
            venueId
            totalRecurringGames
            duplicateGroups
            duplicateEntries
            groups {
                canonicalId
                canonicalName
                canonicalDayOfWeek
                canonicalGameCount
                duplicates {
                    id
                    name
                    similarity
                    gameCount
                }
                totalGamesToReassign
            }
        }
    }
`;

const reResolveRecurringAssignmentMutation = /* GraphQL */ `
    mutation ReResolveRecurringAssignment(
        $gameId: ID!
        $thresholds: RecurringGameAdminThresholdsInput
        $preview: Boolean
    ) {
        reResolveRecurringAssignment(
            gameId: $gameId
            thresholds: $thresholds
            preview: $preview
        ) {
            success
            error
            game {
                id
                name
                dayOfWeek
                venueId
                currentRecurringGameId
            }
            action
            newRecurringGameId
            matchDetails {
                matchType
                matchedTo
                matchedToId
                matchedToDay
                gameDay
                score
                previousId
                needsReview
            }
            topCandidates {
                id
                name
                score
                dayOfWeek
            }
            thresholdsUsed {
                highConfidence
                mediumConfidence
                crossDaySuggestion
                duplicateSimilarity
            }
            applied
        }
    }
`;

const reResolveRecurringAssignmentsForVenueMutation = /* GraphQL */ `
    mutation ReResolveRecurringAssignmentsForVenue(
        $venueId: ID!
        $thresholds: RecurringGameAdminThresholdsInput
        $preview: Boolean
    ) {
        reResolveRecurringAssignmentsForVenue(
            venueId: $venueId
            thresholds: $thresholds
            preview: $preview
        ) {
            success
            venueId
            totalGames
            eligibleGames
            processed
            actions {
                REASSIGN
                CONFIRM
                SUGGEST_REASSIGN
                SUGGEST_CROSS_DAY
                SUGGEST_UNASSIGN
                NO_CHANGE
                SKIPPED
                ERROR
            }
            details {
                gameId
                gameName
                action
                matchDetails {
                    matchType
                    matchedTo
                    matchedToId
                    score
                    previousId
                    needsReview
                }
                error
            }
            preview
        }
    }
`;

const mergeRecurringGameDuplicatesMutation = /* GraphQL */ `
    mutation MergeRecurringGameDuplicates(
        $canonicalId: ID!
        $duplicateIds: [ID!]!
        $preview: Boolean
    ) {
        mergeRecurringGameDuplicates(
            canonicalId: $canonicalId
            duplicateIds: $duplicateIds
            preview: $preview
        ) {
            success
            error
            canonicalId
            canonicalName
            duplicatesMerged
            gamesReassigned
            preview
            details {
                duplicateId
                gamesCount
            }
        }
    }
`;

const cleanupOrphanedRecurringGamesMutation = /* GraphQL */ `
    mutation CleanupOrphanedRecurringGames($venueId: ID!, $preview: Boolean) {
        cleanupOrphanedRecurringGames(venueId: $venueId, preview: $preview) {
            success
            venueId
            orphansFound
            orphansRemoved
            preview
            orphans {
                id
                name
                dayOfWeek
                createdAt
            }
        }
    }
`;

// ============================================================================
// INSTANCE TRACKING QUERIES & MUTATIONS
// ============================================================================

const detectRecurringGameGapsMutation = /* GraphQL */ `
    mutation DetectRecurringGameGaps($input: DetectInstanceGapsInput!) {
        detectRecurringGameGaps(input: $input) {
            success
            venueId
            venueName
            startDate
            endDate
            weeksAnalyzed
            recurringGamesChecked
            expectedOccurrences
            confirmedOccurrences
            gapsFound
            gaps {
                recurringGameId
                recurringGameName
                expectedDate
                dayOfWeek
                weekKey
                possibleMatchGameId
                possibleMatchGameName
                matchConfidence
            }
            instancesCreated
        }
    }
`;

const reconcileRecurringInstancesMutation = /* GraphQL */ `
    mutation ReconcileRecurringInstances($input: ReconcileInstancesInput!) {
        reconcileRecurringInstances(input: $input) {
            success
            venueId
            gamesAnalyzed
            instancesCreated
            instancesUpdated
            orphanGames
            preview
            details {
                gameId
                gameName
                gameDate
                action
                instanceId
                recurringGameId
                recurringGameName
            }
        }
    }
`;

const recordMissedInstanceMutation = /* GraphQL */ `
    mutation RecordMissedInstance($input: RecordMissedInstanceInput!) {
        recordMissedInstance(input: $input) {
            success
            message
            wasCreated
            instance {
                id
                recurringGameId
                recurringGameName
                expectedDate
                dayOfWeek
                status
                cancellationReason
                notes
            }
        }
    }
`;

const updateInstanceStatusMutation = /* GraphQL */ `
    mutation UpdateInstanceStatus($input: UpdateInstanceStatusInput!) {
        updateInstanceStatus(input: $input) {
            success
            message
            instance {
                id
                status
                cancellationReason
                notes
                adminNotes
            }
        }
    }
`;

const getVenueComplianceReportQuery = /* GraphQL */ `
    query GetVenueComplianceReport($venueId: ID!, $startDate: AWSDate!, $endDate: AWSDate!) {
        getVenueComplianceReport(venueId: $venueId, startDate: $startDate, endDate: $endDate) {
            success
            venueId
            venueName
            startDate
            endDate
            totalExpected
            totalConfirmed
            totalCancelled
            totalSkipped
            totalUnknown
            totalNoShow
            overallComplianceRate
            weekSummaries {
                weekKey
                weekStartDate
                confirmedCount
                cancelledCount
                skippedCount
                unknownCount
                noShowCount
                totalExpected
                complianceRate
                instances {
                    id
                    recurringGameId
                    recurringGameName
                    gameId
                    expectedDate
                    dayOfWeek
                    status
                    hasDeviation
                    deviationType
                    cancellationReason
                    notes
                    needsReview
                }
            }
            needsReviewCount
            unknownCount
        }
    }
`;

const getWeekInstancesQuery = /* GraphQL */ `
    query GetWeekInstances($venueId: ID!, $weekKey: String!) {
        getWeekInstances(venueId: $venueId, weekKey: $weekKey) {
            weekKey
            weekStartDate
            confirmedCount
            cancelledCount
            skippedCount
            unknownCount
            noShowCount
            totalExpected
            complianceRate
            instances {
                id
                recurringGameId
                recurringGameName
                gameId
                expectedDate
                dayOfWeek
                status
                hasDeviation
                deviationType
                cancellationReason
                notes
                needsReview
                reviewReason
            }
        }
    }
`;

const listInstancesNeedingReviewQuery = /* GraphQL */ `
    query ListInstancesNeedingReview($venueId: ID, $entityId: ID, $limit: Int, $nextToken: String) {
        listInstancesNeedingReview(venueId: $venueId, entityId: $entityId, limit: $limit, nextToken: $nextToken) {
            items {
                id
                recurringGameId
                recurringGameName
                gameId
                expectedDate
                dayOfWeek
                weekKey
                venueId
                status
                hasDeviation
                deviationType
                deviationDetails
                cancellationReason
                notes
                needsReview
                reviewReason
            }
            nextToken
            totalCount
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
// ADMIN TYPES
// ============================================================================

export interface AdminThresholds {
    highConfidence: number;
    mediumConfidence: number;
    crossDaySuggestion: number;
    duplicateSimilarity: number;
}

export const DEFAULT_ADMIN_THRESHOLDS: AdminThresholds = {
    highConfidence: 75,
    mediumConfidence: 50,
    crossDaySuggestion: 60,
    duplicateSimilarity: 0.85
};

export interface MatchDetails {
    matchType: string;
    matchedTo?: string;
    matchedToId?: string;
    matchedToDay?: string;
    gameDay?: string;
    score?: number;
    previousId?: string;
    needsReview?: boolean;
    scoringDetails?: Record<string, unknown>;
}

export interface TopCandidate {
    id: string;
    name: string;
    score: number;
    dayOfWeek?: string;
}

export interface ReResolveGameResult {
    success: boolean;
    error?: string;
    game?: {
        id: string;
        name: string;
        dayOfWeek?: string;
        venueId?: string;
        currentRecurringGameId?: string;
    };
    action: string;
    newRecurringGameId?: string;
    matchDetails?: MatchDetails;
    topCandidates?: TopCandidate[];
    thresholdsUsed?: AdminThresholds;
    applied?: boolean;
}

export interface GameActionDetail {
    gameId: string;
    gameName: string;
    action: string;
    matchDetails?: MatchDetails;
    error?: string;
}

export interface ActionSummary {
    REASSIGN: number;
    CONFIRM: number;
    SUGGEST_REASSIGN: number;
    SUGGEST_CROSS_DAY: number;
    SUGGEST_UNASSIGN: number;
    NO_CHANGE: number;
    SKIPPED: number;
    ERROR: number;
}

export interface ReResolveVenueResult {
    success?: boolean;
    venueId: string;
    totalGames: number;
    eligibleGames: number;
    processed: number;
    actions: ActionSummary;
    details: GameActionDetail[];
    preview: boolean;
}

export interface DuplicateEntry {
    id: string;
    name: string;
    similarity: number;
    gameCount: number;
}

export interface DuplicateGroup {
    canonicalId: string;
    canonicalName: string;
    canonicalDayOfWeek: string;
    canonicalGameCount: number;
    duplicates: DuplicateEntry[];
    totalGamesToReassign: number;
}

export interface FindDuplicatesResult {
    success?: boolean;
    venueId: string;
    totalRecurringGames: number;
    duplicateGroups: number;
    duplicateEntries: number;
    groups: DuplicateGroup[];
}

export interface MergeDetail {
    duplicateId: string;
    gamesCount: number;
}

export interface MergeDuplicatesResult {
    success: boolean;
    error?: string;
    canonicalId?: string;
    canonicalName?: string;
    duplicatesMerged: number;
    gamesReassigned: number;
    preview: boolean;
    details?: MergeDetail[];
}

export interface OrphanedRecurringGame {
    id: string;
    name: string;
    dayOfWeek: string;
    createdAt?: string;
}

export interface RecurringGameDistribution {
    id: string;
    name: string;
    dayOfWeek: string;
    gameCount: number;
}

export interface RecurringGameVenueStats {
    success?: boolean;
    venueId: string;
    totalRecurringGames: number;
    totalGames: number;
    orphanedRecurringGames: number;
    orphans: OrphanedRecurringGame[];
    unassignedGames: number;
    unassignedSample: Array<{ id: string; name: string; dayOfWeek?: string }>;
    recurringGamesByDay: Record<string, number>;
    gameDistribution: RecurringGameDistribution[];
}

export interface CleanupOrphansResult {
    success?: boolean;
    venueId: string;
    orphansFound: number;
    orphansRemoved: number;
    preview: boolean;
    orphans: OrphanedRecurringGame[];
}

// ============================================================================
// INSTANCE TRACKING TYPES
// ============================================================================

export interface GapInfo {
    recurringGameId: string;
    recurringGameName: string;
    expectedDate: string;
    dayOfWeek: string;
    weekKey: string;
    possibleMatchGameId?: string;
    possibleMatchGameName?: string;
    matchConfidence?: number;
}

export interface DetectGapsResult {
    success: boolean;
    venueId: string;
    venueName?: string;
    startDate: string;
    endDate: string;
    weeksAnalyzed: number;
    recurringGamesChecked: number;
    expectedOccurrences: number;
    confirmedOccurrences: number;
    gapsFound: number;
    gaps: GapInfo[];
    instancesCreated?: number;
}

export interface ReconcileInstanceDetail {
    gameId: string;
    gameName: string;
    gameDate: string;
    action: string;
    instanceId?: string;
    recurringGameId?: string;
    recurringGameName?: string;
}

export interface ReconcileInstancesResult {
    success: boolean;
    venueId: string;
    gamesAnalyzed: number;
    instancesCreated: number;
    instancesUpdated: number;
    orphanGames: number;
    preview: boolean;
    details: ReconcileInstanceDetail[];
}

export interface RecurringGameInstance {
    id: string;
    recurringGameId: string;
    recurringGameName?: string;
    gameId?: string;
    expectedDate: string;
    dayOfWeek: string;
    weekKey?: string;
    venueId?: string;
    status: 'CONFIRMED' | 'CANCELLED' | 'SKIPPED' | 'REPLACED' | 'UNKNOWN' | 'NO_SHOW';
    hasDeviation?: boolean;
    deviationType?: string;
    deviationDetails?: string;
    cancellationReason?: string;
    notes?: string;
    adminNotes?: string;
    needsReview?: boolean;
    reviewReason?: string;
}

export interface InstanceWeekSummary {
    weekKey: string;
    weekStartDate?: string;
    confirmedCount: number;
    cancelledCount: number;
    skippedCount: number;
    unknownCount: number;
    noShowCount: number;
    totalExpected: number;
    complianceRate: number;
    instances: RecurringGameInstance[];
}

export interface VenueComplianceReport {
    success: boolean;
    venueId: string;
    venueName?: string;
    startDate: string;
    endDate: string;
    totalExpected: number;
    totalConfirmed: number;
    totalCancelled: number;
    totalSkipped: number;
    totalUnknown: number;
    totalNoShow: number;
    overallComplianceRate: number;
    weekSummaries: InstanceWeekSummary[];
    needsReviewCount: number;
    unknownCount: number;
}

export interface RecordMissedInstanceResult {
    success: boolean;
    message?: string;
    wasCreated: boolean;
    instance?: RecurringGameInstance;
}

export interface UpdateInstanceResult {
    success: boolean;
    message?: string;
    instance?: RecurringGameInstance;
}

export interface InstancesNeedingReviewResult {
    items: RecurringGameInstance[];
    nextToken?: string;
    totalCount?: number;
}

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

/**
 * Get human-readable action description
 */
export const getActionDescription = (action: string): { label: string; color: string; description: string } => {
    const actions: Record<string, { label: string; color: string; description: string }> = {
        REASSIGN: {
            label: 'Reassign',
            color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30',
            description: 'Will be reassigned to a different recurring game'
        },
        CONFIRM: {
            label: 'Confirmed',
            color: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30',
            description: 'Current assignment is correct'
        },
        SUGGEST_REASSIGN: {
            label: 'Review',
            color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30',
            description: 'Possible reassignment - needs manual review'
        },
        SUGGEST_CROSS_DAY: {
            label: 'Cross-Day',
            color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30',
            description: 'Similar game found on different day'
        },
        SUGGEST_UNASSIGN: {
            label: 'Unassign',
            color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30',
            description: 'No good match found - consider unassigning'
        },
        NO_CHANGE: {
            label: 'No Change',
            color: 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-800',
            description: 'No action needed'
        },
        SKIPPED: {
            label: 'Skipped',
            color: 'text-gray-500 bg-gray-100 dark:text-gray-500 dark:bg-gray-800',
            description: 'Not applicable (series game)'
        },
        ERROR: {
            label: 'Error',
            color: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/50',
            description: 'Error during processing'
        }
    };
    
    return actions[action] || { label: action, color: 'text-gray-600 bg-gray-50', description: 'Unknown action' };
};

/**
 * Format similarity as percentage
 */
export const formatSimilarity = (similarity: number): string => {
    return `${(similarity * 100).toFixed(0)}%`;
};

/**
 * Calculate total changes from action summary
 */
export const countPendingChanges = (actions: ActionSummary): number => {
    return actions.REASSIGN + actions.SUGGEST_REASSIGN + actions.SUGGEST_CROSS_DAY + actions.SUGGEST_UNASSIGN;
};

/**
 * Get status badge styling for instances
 */
export const getInstanceStatusStyle = (status: string): { label: string; color: string } => {
    const styles: Record<string, { label: string; color: string }> = {
        CONFIRMED: { label: 'Confirmed', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
        CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
        SKIPPED: { label: 'Skipped', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
        REPLACED: { label: 'Replaced', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
        UNKNOWN: { label: 'Unknown', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
        NO_SHOW: { label: 'No Show', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
    };
    return styles[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
};

/**
 * Format week key for display (e.g., "2026-W02" -> "Week 2, 2026")
 */
export const formatWeekKey = (weekKey: string): string => {
    const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return weekKey;
    return `Week ${parseInt(match[2])}, ${match[1]}`;
};

/**
 * Get current week key
 */
export const getCurrentWeekKey = (): string => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/**
 * Get date range for last N weeks
 */
export const getDateRangeForWeeks = (weeks: number): { startDate: string; endDate: string } => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (weeks * 7));
    
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
    };
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

export const fetchRecurringGamesByVenue = async (venueId: string): Promise<RecurringGame[]> => {
    try {
        const response = await getClient().graphql({
            query: listRecurringGamesQuery,
            variables: {
                filter: {
                    venueId: { eq: venueId },
                    isActive: { eq: true }
                },
                limit: 500
            }
        }) as { data: { listRecurringGames: { items: RecurringGame[] } } };
        return response.data.listRecurringGames.items;
    } catch (error) {
        console.error('Error fetching recurring games by venue:', error);
        throw error;
    }
};

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

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * Get statistics about recurring games for a venue
 */
export const getRecurringGameVenueStats = async (venueId: string): Promise<RecurringGameVenueStats> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: getRecurringGameVenueStatsQuery,
        variables: { venueId }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.getRecurringGameVenueStats;
};

/**
 * Find duplicate recurring game entries at a venue
 */
export const findRecurringGameDuplicates = async (
    venueId: string,
    similarityThreshold?: number
): Promise<FindDuplicatesResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: findRecurringGameDuplicatesQuery,
        variables: { venueId, similarityThreshold }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.findRecurringGameDuplicates;
};

/**
 * Re-resolve recurring assignment for a single game
 */
export const reResolveRecurringAssignment = async (
    gameId: string,
    thresholds?: Partial<AdminThresholds>,
    preview: boolean = true
): Promise<ReResolveGameResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: reResolveRecurringAssignmentMutation,
        variables: { 
            gameId, 
            thresholds: thresholds ? { ...DEFAULT_ADMIN_THRESHOLDS, ...thresholds } : undefined,
            preview 
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.reResolveRecurringAssignment;
};

/**
 * Re-resolve all recurring assignments for games at a venue
 */
export const reResolveRecurringAssignmentsForVenue = async (
    venueId: string,
    thresholds?: Partial<AdminThresholds>,
    preview: boolean = true
): Promise<ReResolveVenueResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: reResolveRecurringAssignmentsForVenueMutation,
        variables: { 
            venueId, 
            thresholds: thresholds ? { ...DEFAULT_ADMIN_THRESHOLDS, ...thresholds } : undefined,
            preview 
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.reResolveRecurringAssignmentsForVenue;
};

/**
 * Merge duplicate recurring game entries
 */
export const mergeRecurringGameDuplicates = async (
    canonicalId: string,
    duplicateIds: string[],
    preview: boolean = true
): Promise<MergeDuplicatesResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: mergeRecurringGameDuplicatesMutation,
        variables: { canonicalId, duplicateIds, preview }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.mergeRecurringGameDuplicates;
};

/**
 * Cleanup orphaned recurring games (those with no assigned games)
 */
export const cleanupOrphanedRecurringGames = async (
    venueId: string,
    preview: boolean = true
): Promise<CleanupOrphansResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: cleanupOrphanedRecurringGamesMutation,
        variables: { venueId, preview }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.cleanupOrphanedRecurringGames;
};

// ============================================================================
// INSTANCE TRACKING OPERATIONS
// ============================================================================

/**
 * Detect gaps in recurring game schedule
 */
export const detectRecurringGameGaps = async (
    venueId: string,
    startDate: string,
    endDate: string,
    createInstances: boolean = false
): Promise<DetectGapsResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: detectRecurringGameGapsMutation,
        variables: { 
            input: { venueId, startDate, endDate, createInstances }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.detectRecurringGameGaps;
};

/**
 * Reconcile games with instances (backfill)
 */
export const reconcileRecurringInstances = async (
    venueId: string,
    startDate: string,
    endDate: string,
    preview: boolean = true
): Promise<ReconcileInstancesResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: reconcileRecurringInstancesMutation,
        variables: {
            input: { venueId, startDate, endDate, preview }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.reconcileRecurringInstances;
};

/**
 * Record a missed/cancelled/skipped instance
 */
export const recordMissedInstance = async (
    recurringGameId: string,
    expectedDate: string,
    status: 'CANCELLED' | 'SKIPPED' | 'NO_SHOW' | 'UNKNOWN',
    cancellationReason?: string,
    notes?: string
): Promise<RecordMissedInstanceResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: recordMissedInstanceMutation,
        variables: {
            input: { recurringGameId, expectedDate, status, cancellationReason, notes }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.recordMissedInstance;
};

/**
 * Update an existing instance status
 */
export const updateInstanceStatus = async (
    instanceId: string,
    status: string,
    cancellationReason?: string,
    notes?: string,
    adminNotes?: string
): Promise<UpdateInstanceResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: updateInstanceStatusMutation,
        variables: {
            input: { instanceId, status, cancellationReason, notes, adminNotes }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.updateInstanceStatus;
};

/**
 * Get compliance report for a venue
 */
export const getVenueComplianceReport = async (
    venueId: string,
    startDate: string,
    endDate: string
): Promise<VenueComplianceReport> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: getVenueComplianceReportQuery,
        variables: { venueId, startDate, endDate }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.getVenueComplianceReport;
};

/**
 * Get instances for a specific week
 */
export const getWeekInstances = async (
    venueId: string,
    weekKey: string
): Promise<InstanceWeekSummary> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: getWeekInstancesQuery,
        variables: { venueId, weekKey }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.getWeekInstances;
};

/**
 * List instances needing review
 */
export const listInstancesNeedingReview = async (
    venueId?: string,
    entityId?: string,
    limit?: number,
    nextToken?: string
): Promise<InstancesNeedingReviewResult> => {
    const client = getClient();
    
    const result = await client.graphql({
        query: listInstancesNeedingReviewQuery,
        variables: { venueId, entityId, limit, nextToken }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    
    return result.data.listInstancesNeedingReview;
};

export const BOOTSTRAP_RECURRING_GAMES = /* GraphQL */ `
  mutation BootstrapRecurringGames($input: BootstrapRecurringGamesInput!) {
    bootstrapRecurringGames(input: $input) {
      success
      venueId
      venueName
      preview
      totalGamesAnalyzed
      eligibleGames
      templatesCreated
      gamesAssigned
      templateDetails {
        name
        dayOfWeek
        gameCount
        avgBuyIn
        sampleGames
        status
        templateId
        gamesAssigned
        error
      }
      errors
    }
  }
`;

export interface BootstrapSampleGame {
  name: string;
  buyIn?: number;
  time?: string;
}

export interface BootstrapTemplateDetail {
  name: string;
  dayOfWeek: string;
  gameType?: 'CASH_GAME' | 'TOURNAMENT';
  gameCount: number;
  avgBuyIn?: number;
  // Extended fields - may not be present until schema is updated
  buyInRange?: string;
  timeSlot?: string;
  confidence?: string;
  // sampleGames comes as AWSJSON - could be string[] or object[]
  sampleGames?: BootstrapSampleGame[] | string[] | unknown;
  status: string;
  templateId?: string;
  gamesAssigned?: number;
  error?: string;
}

export interface BootstrapRecurringGamesResult {
  success: boolean;
  venueId: string;
  venueName?: string;
  preview: boolean;
  // Extended field - may not be present until schema is updated
  clusteringMethod?: string;
  totalGamesAnalyzed: number;
  eligibleGames: number;
  templatesCreated: number;
  gamesAssigned: number;
  templateDetails: BootstrapTemplateDetail[];
  errors?: unknown[];
}

export const bootstrapRecurringGames = async (
  venueId: string,
  options: {
    minGamesForTemplate?: number;
    similarityThreshold?: number;
    preview?: boolean;
    includeAssigned?: boolean;
  } = {}
): Promise<BootstrapRecurringGamesResult> => {
const { data } = await getClient().graphql({
    query: BOOTSTRAP_RECURRING_GAMES,
    variables: {
      input: {
        venueId,
        minGamesForTemplate: options.minGamesForTemplate ?? 2,
        similarityThreshold: options.similarityThreshold ?? 0.7,
        preview: options.preview ?? true,
        includeAssigned: options.includeAssigned ?? false
      }
    }
  }) as { data: { bootstrapRecurringGames: BootstrapRecurringGamesResult } };
  
  return data.bootstrapRecurringGames;
};