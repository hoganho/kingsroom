// src/services/scrapeURLService.ts
// Service for querying ScrapeURL status for skip options
// UPDATED: Added doNotScrape tracking for pre-fetch blocking

import { generateClient } from 'aws-amplify/api';

const getClient = () => generateClient();

// ===================================================================
// TYPES
// ===================================================================

export interface ScrapeURLStatus {
  id: string;
  tournamentId: number;
  lastScrapeStatus: string | null;
  gameStatus: string | null;
  entityId: string | null;
  doNotScrape: boolean;  // NEW: Track doNotScrape flag
  latestS3Key?: string;  // NEW: Track if S3 cache exists
}

export interface ScrapeURLStatusCache {
  [tournamentId: number]: ScrapeURLStatus;
}

// ===================================================================
// GRAPHQL QUERIES
// Updated to include doNotScrape and latestS3Key fields
// ===================================================================

// Query using byEntityScrapeURL GSI - actual generated name is scrapeURLSByEntityId
const SCRAPE_URLS_BY_ENTITY_GSI = /* GraphQL */ `
  query ScrapeURLSByEntityId(
    $entityId: ID!
    $limit: Int
    $nextToken: String
  ) {
    scrapeURLSByEntityId(
      entityId: $entityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        tournamentId
        lastScrapeStatus
        gameStatus
        entityId
        doNotScrape
        latestS3Key
      }
      nextToken
    }
  }
`;

// Fallback: Use custom searchScrapeURLs resolver (Lambda-based)
const SEARCH_SCRAPE_URLS = /* GraphQL */ `
  query SearchScrapeURLs(
    $entityId: ID
    $limit: Int
    $nextToken: String
  ) {
    searchScrapeURLs(
      entityId: $entityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        tournamentId
        lastScrapeStatus
        gameStatus
        entityId
        doNotScrape
        latestS3Key
      }
      nextToken
    }
  }
`;

// Query by tournament ID - actual generated name is scrapeURLSByTournamentId
const SCRAPE_URLS_BY_TOURNAMENT_ID = /* GraphQL */ `
  query ScrapeURLSByTournamentId(
    $tournamentId: Int!
    $limit: Int
  ) {
    scrapeURLSByTournamentId(
      tournamentId: $tournamentId
      limit: $limit
    ) {
      items {
        id
        tournamentId
        lastScrapeStatus
        gameStatus
        entityId
        doNotScrape
        latestS3Key
      }
    }
  }
`;

// ===================================================================
// SERVICE FUNCTIONS
// ===================================================================

/**
 * Check if a tournament ID should be skipped based on NOT_PUBLISHED status
 */
export const shouldSkipNotPublished = async (
  tournamentId: number,
  entityId: string
): Promise<boolean> => {
  try {
    const client = getClient();
    let items: ScrapeURLStatus[] = [];
    
    try {
      const response = await client.graphql({
        query: SCRAPE_URLS_BY_TOURNAMENT_ID,
        variables: { tournamentId, limit: 10 }
      }) as any;
      
      items = response?.data?.scrapeURLSByTournamentId?.items || [];
    } catch (queryError: any) {
      if (queryError?.data?.scrapeURLSByTournamentId?.items) {
        items = queryError.data.scrapeURLSByTournamentId.items;
      } else {
        console.error('[scrapeURLService] Error checking NOT_PUBLISHED status:', queryError?.message || queryError);
        return false;
      }
    }
    
    const match = items.find((item: ScrapeURLStatus) => item?.entityId === entityId);
    const result = match?.gameStatus === 'NOT_PUBLISHED';
    
    if (result) {
      console.log(`[scrapeURLService] shouldSkipNotPublished(${tournamentId}): SKIP`);
    }
    
    return result;
  } catch (error: any) {
    console.error('[scrapeURLService] Error checking NOT_PUBLISHED status:', error?.message || error);
    return false;
  }
};

/**
 * Check if a gap ID should be skipped based on NOT_FOUND status
 */
export const shouldSkipNotFoundGap = async (
  tournamentId: number,
  entityId: string
): Promise<boolean> => {
  try {
    const client = getClient();
    let items: ScrapeURLStatus[] = [];
    
    try {
      const response = await client.graphql({
        query: SCRAPE_URLS_BY_TOURNAMENT_ID,
        variables: { tournamentId, limit: 10 }
      }) as any;
      
      items = response?.data?.scrapeURLSByTournamentId?.items || [];
    } catch (queryError: any) {
      if (queryError?.data?.scrapeURLSByTournamentId?.items) {
        items = queryError.data.scrapeURLSByTournamentId.items;
      } else {
        console.error('[scrapeURLService] Error checking NOT_FOUND gap status:', queryError?.message || queryError);
        return false;
      }
    }
    
    const match = items.find((item: ScrapeURLStatus) => item?.entityId === entityId);
    
    let result = false;
    if (match) {
      const status = match.lastScrapeStatus?.toUpperCase();
      result = status === 'NOT_FOUND' || status === 'BLANK';
    }
    
    if (result) {
      console.log(`[scrapeURLService] shouldSkipNotFoundGap(${tournamentId}): SKIP (${match?.lastScrapeStatus})`);
    }
    
    return result;
  } catch (error: any) {
    console.error('[scrapeURLService] Error checking NOT_FOUND gap status:', error?.message || error);
    return false;
  }
};

/**
 * Pre-fetch ScrapeURL statuses for a batch of tournament IDs
 * Returns a cache object for O(1) lookup
 * NOW INCLUDES: doNotScrape flag and latestS3Key
 */
export const prefetchScrapeURLStatuses = async (
  entityId: string,
  tournamentIds: number[]
): Promise<ScrapeURLStatusCache> => {
  const cache: ScrapeURLStatusCache = {};
  
  console.log(`[scrapeURLService] prefetchScrapeURLStatuses called:`, {
    entityId,
    tournamentIdsCount: tournamentIds.length,
    firstFewIds: tournamentIds.slice(0, 5),
    lastFewIds: tournamentIds.slice(-5)
  });
  
  if (tournamentIds.length === 0) {
    console.log('[scrapeURLService] No tournament IDs to prefetch');
    return cache;
  }
  
  const minId = Math.min(...tournamentIds);
  const maxId = Math.max(...tournamentIds);
  
  console.log(`[scrapeURLService] Prefetch range: ${minId} to ${maxId}`);
  
  try {
    const client = getClient();
    let nextToken: string | null = null;
    
    do {
      let items: ScrapeURLStatus[] = [];
      
      try {
        const response = await client.graphql({
          query: SCRAPE_URLS_BY_ENTITY_GSI,
          variables: { 
            entityId,
            limit: 1000,
            nextToken 
          }
        }) as any;
        
        items = response?.data?.scrapeURLSByEntityId?.items || [];
        nextToken = response?.data?.scrapeURLSByEntityId?.nextToken || null;
        
        console.log(`[scrapeURLService] GSI query returned ${items.length} items, nextToken: ${!!nextToken}`);
        
        if (items.length > 0) {
          console.log('[scrapeURLService] Sample items from GSI:', items.slice(0, 3).map(i => ({
            tournamentId: i?.tournamentId,
            gameStatus: i?.gameStatus,
            lastScrapeStatus: i?.lastScrapeStatus,
            doNotScrape: i?.doNotScrape
          })));
        }
        
        if (response?.errors?.length) {
          console.warn('[scrapeURLService] GSI query had errors but returned data:', response.errors.length, 'errors');
        }
      } catch (gsiError: any) {
        if (gsiError?.data?.scrapeURLSByEntityId?.items) {
          items = gsiError.data.scrapeURLSByEntityId.items;
          nextToken = gsiError.data.scrapeURLSByEntityId.nextToken || null;
          console.warn('[scrapeURLService] GSI query had errors but returned', items.length, 'items');
        } else {
          console.log('[scrapeURLService] GSI query failed, trying searchScrapeURLs fallback...');
          
          try {
            const searchResponse = await client.graphql({
              query: SEARCH_SCRAPE_URLS,
              variables: { 
                entityId,
                limit: 1000,
                nextToken 
              }
            }) as any;
            
            items = searchResponse?.data?.searchScrapeURLs?.items || [];
            nextToken = searchResponse?.data?.searchScrapeURLs?.nextToken || null;
            console.log(`[scrapeURLService] searchScrapeURLs returned ${items.length} items`);
          } catch (searchError: any) {
            if (searchError?.data?.searchScrapeURLs?.items) {
              items = searchError.data.searchScrapeURLs.items;
              nextToken = searchError.data.searchScrapeURLs.nextToken || null;
              console.log(`[scrapeURLService] searchScrapeURLs partial success: ${items.length} items`);
            } else {
              console.error('[scrapeURLService] Both queries failed completely');
              return cache;
            }
          }
        }
      }
      
      // Filter and cache only the IDs we care about
      let itemsInRange = 0;
      for (const item of items) {
        if (item && item.tournamentId >= minId && item.tournamentId <= maxId) {
          cache[item.tournamentId] = {
            ...item,
            doNotScrape: item.doNotScrape ?? false  // Ensure boolean
          };
          itemsInRange++;
        }
      }
      console.log(`[scrapeURLService] Cached ${itemsInRange} items in range ${minId}-${maxId}`);
      
      // Stop if we've found all the IDs we need
      if (Object.keys(cache).length >= tournamentIds.length) {
        break;
      }
      
    } while (nextToken);
    
    console.log(`[scrapeURLService] Prefetched ${Object.keys(cache).length} ScrapeURL statuses`);
    return cache;
    
  } catch (error: any) {
    console.error('[scrapeURLService] Error prefetching statuses:', error?.message || error);
    return cache;
  }
};

/**
 * Check from cache if a tournament should be skipped as NOT_PUBLISHED
 */
export const checkCachedNotPublished = (
  cache: ScrapeURLStatusCache,
  tournamentId: number
): boolean => {
  const entry = cache[tournamentId];
  const result = entry?.gameStatus === 'NOT_PUBLISHED';
  if (result) {
    console.log(`[scrapeURLService] checkCachedNotPublished(${tournamentId}): SKIP`);
  }
  return result;
};

/**
 * Check from cache if a gap should be skipped as NOT_FOUND
 */
export const checkCachedNotFoundGap = (
  cache: ScrapeURLStatusCache,
  tournamentId: number
): boolean => {
  const entry = cache[tournamentId];
  if (!entry) return false;
  
  const status = entry.lastScrapeStatus?.toUpperCase();
  const result = status === 'NOT_FOUND' || status === 'BLANK';
  if (result) {
    console.log(`[scrapeURLService] checkCachedNotFoundGap(${tournamentId}): SKIP (${entry.lastScrapeStatus})`);
  }
  return result;
};

/**
 * NEW: Check from cache if a tournament is marked as doNotScrape
 * Returns the cached status if found, null otherwise
 */
export const checkCachedDoNotScrape = (
  cache: ScrapeURLStatusCache,
  tournamentId: number
): { doNotScrape: boolean; gameStatus: string | null; hasS3Cache: boolean } | null => {
  const entry = cache[tournamentId];
  if (!entry) return null;
  
  return {
    doNotScrape: entry.doNotScrape ?? false,
    gameStatus: entry.gameStatus,
    hasS3Cache: !!entry.latestS3Key
  };
};

/**
 * NEW: Get full cached status for a tournament
 * Used when doNotScrape is detected to show ScrapeOptionsModal
 */
export const getCachedStatus = (
  cache: ScrapeURLStatusCache,
  tournamentId: number
): ScrapeURLStatus | null => {
  return cache[tournamentId] || null;
};

export default {
  shouldSkipNotPublished,
  shouldSkipNotFoundGap,
  prefetchScrapeURLStatuses,
  checkCachedNotPublished,
  checkCachedNotFoundGap,
  checkCachedDoNotScrape,
  getCachedStatus,
};
