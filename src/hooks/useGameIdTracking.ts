// src/hooks/useGameIdTracking.ts
/**
 * React hook for efficient game ID tracking and gap detection
 * Replaces the old findSkippedTournamentIds utility with server-side processing
 */

import { useState, useCallback, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';

const client = generateClient();

// ===================================================================
// TYPES
// ===================================================================

export interface GapRange {
  start: number;
  end: number;
  count: number;
}

export interface GapSummary {
  totalGaps: number;
  totalMissingIds: number;
  largestGapStart?: number;
  largestGapEnd?: number;
  largestGapCount?: number;
  coveragePercentage: number;
}

export interface EntityScrapingStatus {
  entityId: string;
  entityName?: string;
  lowestTournamentId?: number;
  highestTournamentId?: number;
  totalGamesStored: number;
  unfinishedGameCount: number;
  gaps: GapRange[];
  gapSummary: GapSummary;
  lastUpdated: string;
  cacheAge: number;
}

export interface TournamentIdBounds {
  entityId: string;
  lowestId?: number;
  highestId?: number;
  totalCount: number;
  lastUpdated: string;
}

export interface UnfinishedGamesResult {
  items: any[];
  nextToken?: string;
  totalCount: number;
}

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

const GET_TOURNAMENT_ID_BOUNDS = /* GraphQL */ `
  query GetTournamentIdBounds($entityId: ID!) {
    getTournamentIdBounds(entityId: $entityId) {
      entityId
      lowestId
      highestId
      totalCount
      lastUpdated
    }
  }
`;

const GET_ENTITY_SCRAPING_STATUS = /* GraphQL */ `
  query GetEntityScrapingStatus(
    $entityId: ID!
    $forceRefresh: Boolean
    $startId: Int
    $endId: Int
  ) {
    getEntityScrapingStatus(
      entityId: $entityId
      forceRefresh: $forceRefresh
      startId: $startId
      endId: $endId
    ) {
      entityId
      entityName
      lowestTournamentId
      highestTournamentId
      totalGamesStored
      unfinishedGameCount
      gaps {
        start
        end
        count
      }
      gapSummary {
        totalGaps
        totalMissingIds
        largestGapStart
        largestGapEnd
        largestGapCount
        coveragePercentage
      }
      lastUpdated
      cacheAge
    }
  }
`;

const FIND_TOURNAMENT_ID_GAPS = /* GraphQL */ `
  query FindTournamentIdGaps(
    $entityId: ID!
    $startId: Int
    $endId: Int
    $maxGapsToReturn: Int
  ) {
    findTournamentIdGaps(
      entityId: $entityId
      startId: $startId
      endId: $endId
      maxGapsToReturn: $maxGapsToReturn
    ) {
      start
      end
      count
    }
  }
`;

const GET_UNFINISHED_GAMES = /* GraphQL */ `
  query GetUnfinishedGamesByEntity(
    $entityId: ID!
    $limit: Int
    $nextToken: String
  ) {
    getUnfinishedGamesByEntity(
      entityId: $entityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        name
        gameStatus
        registrationStatus
        gameStartDateTime
        tournamentId
        totalEntries
        playersRemaining
      }
      nextToken
      totalCount
    }
  }
`;

const LIST_EXISTING_TOURNAMENT_IDS = /* GraphQL */ `
  query ListExistingTournamentIds(
    $entityId: ID!
    $startId: Int
    $endId: Int
    $limit: Int
  ) {
    listExistingTournamentIds(
      entityId: $entityId
      startId: $startId
      endId: $endId
      limit: $limit
    )
  }
`;

// ===================================================================
// MAIN HOOK
// ===================================================================

export const useGameIdTracking = (entityId?: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [scrapingStatus, setScrapingStatus] = useState<EntityScrapingStatus | null>(null);
  const [bounds, setBounds] = useState<TournamentIdBounds | null>(null);

  // ===================================================================
  // GET BOUNDS
  // ===================================================================
  
  const getBounds = useCallback(async (targetEntityId?: string) => {
    const id = targetEntityId || entityId;
    if (!id) {
      throw new Error('Entity ID is required');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: GET_TOURNAMENT_ID_BOUNDS,
        variables: { entityId: id }
      }) as { data: { getTournamentIdBounds: TournamentIdBounds } };

      const result = response.data.getTournamentIdBounds;
      setBounds(result);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useGameIdTracking] Error getting bounds:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // ===================================================================
  // GET SCRAPING STATUS (Main method - replaces findSkippedTournamentIds)
  // ===================================================================
  
  const getScrapingStatus = useCallback(async (options?: {
    entityId?: string;
    forceRefresh?: boolean;
    startId?: number;
    endId?: number;
  }) => {
    const id = options?.entityId || entityId;
    if (!id) {
      throw new Error('Entity ID is required');
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[useGameIdTracking] Fetching scraping status...', {
        entityId: id,
        forceRefresh: options?.forceRefresh,
        startId: options?.startId,
        endId: options?.endId
      });

      const response = await client.graphql({
        query: GET_ENTITY_SCRAPING_STATUS,
        variables: {
          entityId: id,
          forceRefresh: options?.forceRefresh || false,
          startId: options?.startId,
          endId: options?.endId
        }
      }) as { data: { getEntityScrapingStatus: EntityScrapingStatus } };

      const result = response.data.getEntityScrapingStatus;
      setScrapingStatus(result);
      
      console.log('[useGameIdTracking] Scraping status received:', {
        totalGames: result.totalGamesStored,
        gaps: result.gapSummary.totalGaps,
        missingIds: result.gapSummary.totalMissingIds,
        coverage: result.gapSummary.coveragePercentage,
        cacheAge: result.cacheAge
      });

      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useGameIdTracking] Error getting scraping status:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // ===================================================================
  // FIND GAPS (Standalone gap detection)
  // ===================================================================
  
  const findGaps = useCallback(async (options?: {
    entityId?: string;
    startId?: number;
    endId?: number;
    maxGapsToReturn?: number;
  }) => {
    const id = options?.entityId || entityId;
    if (!id) {
      throw new Error('Entity ID is required');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: FIND_TOURNAMENT_ID_GAPS,
        variables: {
          entityId: id,
          startId: options?.startId,
          endId: options?.endId,
          maxGapsToReturn: options?.maxGapsToReturn || 1000
        }
      }) as { data: { findTournamentIdGaps: GapRange[] } };

      const gaps = response.data.findTournamentIdGaps;
      console.log(`[useGameIdTracking] Found ${gaps.length} gaps`);
      return gaps;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useGameIdTracking] Error finding gaps:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // ===================================================================
  // GET UNFINISHED GAMES
  // ===================================================================
  
  const getUnfinishedGames = useCallback(async (options?: {
    entityId?: string;
    limit?: number;
    nextToken?: string;
  }) => {
    const id = options?.entityId || entityId;
    if (!id) {
      throw new Error('Entity ID is required');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: GET_UNFINISHED_GAMES,
        variables: {
          entityId: id,
          limit: options?.limit || 50,
          nextToken: options?.nextToken
        }
      }) as { data: { getUnfinishedGamesByEntity: UnfinishedGamesResult } };

      const result = response.data.getUnfinishedGamesByEntity;
      console.log(`[useGameIdTracking] Found ${result.items.length} unfinished games (total: ${result.totalCount})`);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useGameIdTracking] Error getting unfinished games:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // ===================================================================
  // LIST EXISTING IDS (for verification)
  // ===================================================================
  
  const listExistingIds = useCallback(async (options?: {
    entityId?: string;
    startId?: number;
    endId?: number;
    limit?: number;
  }) => {
    const id = options?.entityId || entityId;
    if (!id) {
      throw new Error('Entity ID is required');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: LIST_EXISTING_TOURNAMENT_IDS,
        variables: {
          entityId: id,
          startId: options?.startId,
          endId: options?.endId,
          limit: options?.limit || 1000
        }
      }) as { data: { listExistingTournamentIds: number[] } };

      const ids = response.data.listExistingTournamentIds;
      console.log(`[useGameIdTracking] Listed ${ids.length} existing IDs`);
      return ids;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useGameIdTracking] Error listing IDs:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // ===================================================================
  // AUTO-LOAD ON MOUNT (optional)
  // ===================================================================
  
  useEffect(() => {
    if (entityId) {
      // Optionally auto-load bounds on mount
      // getBounds();
    }
  }, [entityId]);

  return {
    // State
    loading,
    error,
    scrapingStatus,
    bounds,
    
    // Methods
    getBounds,
    getScrapingStatus,
    findGaps,
    getUnfinishedGames,
    listExistingIds,
    
    // Computed helpers
    hasData: !!scrapingStatus,
    hasBounds: !!bounds,
  };
};

// ===================================================================
// UTILITY FUNCTIONS (for backwards compatibility)
// ===================================================================

/**
 * Generate URLs for gap ranges
 */
export const generateURLsForGaps = (
  gaps: GapRange[],
  entityConfig: { gameUrlDomain: string; gameUrlPath: string }
): string[] => {
  const urls: string[] = [];
  
  for (const gap of gaps) {
    for (let id = gap.start; id <= gap.end; id++) {
      const url = `${entityConfig.gameUrlDomain}${entityConfig.gameUrlPath}?id=${id}`;
      urls.push(url);
    }
  }
  
  return urls;
};

/**
 * Get human-readable summary of gaps
 */
export const getGapsSummary = (status: EntityScrapingStatus): string => {
  const { gapSummary } = status;
  
  if (gapSummary.totalMissingIds === 0) {
    return `No gaps found! All IDs from ${status.lowestTournamentId} to ${status.highestTournamentId} are present.`;
  }
  
  const largest = gapSummary.largestGapCount 
    ? `Largest gap: ${gapSummary.largestGapStart}-${gapSummary.largestGapEnd} (${gapSummary.largestGapCount} IDs)`
    : '';
  
  return `Found ${gapSummary.totalMissingIds} missing IDs in ${gapSummary.totalGaps} gaps. ` +
         `Coverage: ${gapSummary.coveragePercentage}%. ${largest}`;
};

/**
 * Format gap ranges for display
 */
export const formatGapRanges = (gaps: GapRange[]): string => {
  if (gaps.length === 0) return 'None';
  
  const formatted = gaps.slice(0, 5).map(gap => {
    if (gap.start === gap.end) {
      return `${gap.start}`;
    }
    return `${gap.start}-${gap.end}`;
  });
  
  if (gaps.length > 5) {
    formatted.push(`... and ${gaps.length - 5} more`);
  }
  
  return formatted.join(', ');
};

// ===================================================================
// STANDALONE FUNCTION (non-hook version for backwards compatibility)
// ===================================================================

/**
 * Direct function call without hook (for use in non-React contexts)
 */
export const getEntityScrapingStatusDirect = async (
  entityId: string,
  options?: {
    forceRefresh?: boolean;
    startId?: number;
    endId?: number;
  }
): Promise<EntityScrapingStatus> => {
  try {
    const response = await client.graphql({
      query: GET_ENTITY_SCRAPING_STATUS,
      variables: {
        entityId,
        forceRefresh: options?.forceRefresh || false,
        startId: options?.startId,
        endId: options?.endId
      }
    }) as { data: { getEntityScrapingStatus: EntityScrapingStatus } };

    return response.data.getEntityScrapingStatus;
  } catch (error) {
    console.error('[getEntityScrapingStatusDirect] Error:', error);
    throw error;
  }
};

/**
 * Direct function for gap detection (backwards compatible with old utility)
 */
export const findTournamentIdGapsDirect = async (
  entityId: string,
  options?: {
    startId?: number;
    endId?: number;
    maxGapsToReturn?: number;
  }
): Promise<GapRange[]> => {
  try {
    const response = await client.graphql({
      query: FIND_TOURNAMENT_ID_GAPS,
      variables: {
        entityId,
        startId: options?.startId,
        endId: options?.endId,
        maxGapsToReturn: options?.maxGapsToReturn || 1000
      }
    }) as { data: { findTournamentIdGaps: GapRange[] } };

    return response.data.findTournamentIdGaps;
  } catch (error) {
    console.error('[findTournamentIdGapsDirect] Error:', error);
    throw error;
  }
};

export default useGameIdTracking;