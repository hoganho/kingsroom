// src/services/recurringGameBackfillService.ts
// Service functions for recurring game instance backfill operations
// VERSION 1.0.2 - Types inline to avoid amplify codegen issues

import { generateClient } from 'aws-amplify/api';
import { backfillRecurringGameInstances } from '../graphql/mutations';
import { getBackfillStatus } from '../graphql/queries';

// ============================================================================
// TYPES
// ============================================================================

export interface BackfillRecurringGameInstancesInput {
    venueId?: string;
    entityId?: string;
    recurringGameId?: string;
    startDate?: string;  // YYYY-MM-DD
    endDate?: string;    // YYYY-MM-DD
    dryRun?: boolean;
}

export interface BackfillRecurringGameInstancesResult {
    success: boolean;
    message?: string;
    error?: string;
    dryRun: boolean;
    
    // Processing stats
    recurringGamesProcessed: number;
    totalExpectedInstances: number;
    existingInstancesFound: number;
    gapsFound: number;
    instancesCreated: number;
    
    // Optional details
    details?: BackfillDetailItem[];
    stats?: BackfillStatsBreakdown;
}

export interface BackfillDetailItem {
    recurringGameId: string;
    recurringGameName: string;
    expectedInstances: number;
    existingInstances: number;
    gapsFound: number;
    instancesCreated: number;
}

export interface BackfillStatsBreakdown {
    byVenue?: Record<string, number>;
    byDayOfWeek?: Record<string, number>;
    byStatus?: Record<string, number>;
}

export interface BackfillStatusResult {
    available: boolean;
    scheduleExpression?: string;
    lastRun?: string;
    lastRunStatus?: string;
    nextScheduledRun?: string;
}

// ============================================================================
// CLIENT
// ============================================================================

const getClient = () => generateClient();

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Backfill recurring game instances for a venue or specific recurring game
 * Creates UNKNOWN status instances for dates where no instance exists
 */
export const backfillRecurringGameInstancesService = async (
    input: BackfillRecurringGameInstancesInput
): Promise<BackfillRecurringGameInstancesResult> => {
    try {
        const result = await getClient().graphql({
            query: backfillRecurringGameInstances,
            variables: { input },
        }) as any;
        
        const data = result.data.backfillRecurringGameInstances;
        
        // Parse AWSJSON fields if present
        if (data.stats && typeof data.stats === 'string') {
            try {
                data.stats = JSON.parse(data.stats);
            } catch (e) {
                console.warn('[backfillRecurringGameInstances] Failed to parse stats JSON:', e);
            }
        }
        
        return data;
    } catch (error: any) {
        console.error('[backfillRecurringGameInstances] Error:', error);
        throw error;
    }
};

/**
 * Get the status of the backfill scheduler (EventBridge rule)
 */
export const getBackfillStatusService = async (): Promise<BackfillStatusResult> => {
    try {
        const result = await getClient().graphql({
            query: getBackfillStatus,
        }) as any;
        
        return result.data.getBackfillStatus;
    } catch (error: any) {
        console.error('[getBackfillStatus] Error:', error);
        // Return a default "not available" status instead of throwing
        return {
            available: false,
        };
    }
};

/**
 * Preview backfill (dry run) - shows what would be created without making changes
 */
export const previewBackfill = async (
    input: BackfillRecurringGameInstancesInput
): Promise<BackfillRecurringGameInstancesResult> => {
    return backfillRecurringGameInstancesService({
        ...input,
        dryRun: true,
    });
};

/**
 * Execute backfill - actually creates the instances
 */
export const executeBackfill = async (
    input: BackfillRecurringGameInstancesInput
): Promise<BackfillRecurringGameInstancesResult> => {
    return backfillRecurringGameInstancesService({
        ...input,
        dryRun: false,
    });
};
