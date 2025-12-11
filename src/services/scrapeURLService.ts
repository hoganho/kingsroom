// src/services/scrapeURLService.ts
// Service for querying ScrapeURL status for skip options

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
}

export interface ScrapeURLStatusCache {
  [tournamentId: number]: ScrapeURLStatus;
}

// ===================================================================
// GRAPHQL QUERIES
// Note: listScrapeURLs is DISABLED in schema (list: null)
// Must use GSI queries or custom searchScrapeURLs resolver
// Note: Avoid requesting fields with enum types that may have invalid values in DB
// ===================================================================

// Query using byEntityScrapeURL GSI - actual generated name is scrapeURLSByEntityId
// Only fetch the minimal fields we need for skip logic
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
      }
    }
  }
`;

// ===================================================================
// SERVICE FUNCTIONS
// ===================================================================

/**
 * Check if a tournament ID should be skipped based on NOT_PUBLISHED status
 * Returns true if the tournament has been previously scraped with gameStatus=NOT_PUBLISHED
 */
export const shouldSkipNotPublished = async (
  tournamentId: number,
  entityId: string
): Promise<boolean> => {
  try {
    const client = getClient();
    
    // Use byTournamentId GSI
    let items: ScrapeURLStatus[] = [];
    
    try {
      const response = await client.graphql({
        query: SCRAPE_URLS_BY_TOURNAMENT_ID,
        variables: { tournamentId, limit: 10 }
      }) as any;
      
      items = response?.data?.scrapeURLSByTournamentId?.items || [];
    } catch (queryError: any) {
      // Check for partial success - data may exist even with enum serialization errors
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
      console.log(`[scrapeURLService] shouldSkipNotPublished(${tournamentId}): SKIP (direct query found NOT_PUBLISHED)`);
    }
    
    return result;
  } catch (error: any) {
    console.error('[scrapeURLService] Error checking NOT_PUBLISHED status:', error?.message || error);
    return false;
  }
};

/**
 * Check if a gap ID should be skipped based on NOT_FOUND status
 * Returns true if the ID has lastScrapeStatus=NOT_FOUND or BLANK
 */
export const shouldSkipNotFoundGap = async (
  tournamentId: number,
  entityId: string
): Promise<boolean> => {
  try {
    const client = getClient();
    
    // Use byTournamentId GSI
    let items: ScrapeURLStatus[] = [];
    
    try {
      const response = await client.graphql({
        query: SCRAPE_URLS_BY_TOURNAMENT_ID,
        variables: { tournamentId, limit: 10 }
      }) as any;
      
      items = response?.data?.scrapeURLSByTournamentId?.items || [];
    } catch (queryError: any) {
      // Check for partial success - data may exist even with enum serialization errors
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
      result = status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE';
    }
    
    if (result) {
      console.log(`[scrapeURLService] shouldSkipNotFoundGap(${tournamentId}): SKIP (direct query found ${match?.lastScrapeStatus})`);
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
    
    // Use byEntityScrapeURL GSI query (scrapeURLSByEntityId)
    do {
      let items: ScrapeURLStatus[] = [];
      
      try {
        // Try GSI query: scrapeURLSByEntityId
        const response = await client.graphql({
          query: SCRAPE_URLS_BY_ENTITY_GSI,
          variables: { 
            entityId,
            limit: 1000,
            nextToken 
          }
        }) as any;
        
        // Handle partial success - data may exist even with errors
        items = response?.data?.scrapeURLSByEntityId?.items || [];
        nextToken = response?.data?.scrapeURLSByEntityId?.nextToken || null;
        
        console.log(`[scrapeURLService] GSI query returned ${items.length} items, nextToken: ${!!nextToken}`);
        
        // Log sample of items returned
        if (items.length > 0) {
          console.log('[scrapeURLService] Sample items from GSI:', items.slice(0, 3).map(i => ({
            tournamentId: i?.tournamentId,
            gameStatus: i?.gameStatus,
            lastScrapeStatus: i?.lastScrapeStatus
          })));
        }
        
        if (response?.errors?.length) {
          console.warn('[scrapeURLService] GSI query had errors but returned data:', response.errors.length, 'errors');
        }
      } catch (gsiError: any) {
        // Check if it's a partial success (has data despite errors)
        if (gsiError?.data?.scrapeURLSByEntityId?.items) {
          items = gsiError.data.scrapeURLSByEntityId.items;
          nextToken = gsiError.data.scrapeURLSByEntityId.nextToken || null;
          console.warn('[scrapeURLService] GSI query had errors but returned', items.length, 'items');
        } else {
          // GSI query failed completely, try searchScrapeURLs
          console.log('[scrapeURLService] GSI query failed completely, error:', gsiError?.message || gsiError);
          console.log('[scrapeURLService] Trying searchScrapeURLs fallback...');
          
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
            
            if (searchResponse?.errors?.length) {
              console.warn('[scrapeURLService] searchScrapeURLs had errors:', searchResponse.errors.length);
            }
          } catch (searchError: any) {
            console.log('[scrapeURLService] searchScrapeURLs threw exception:', {
              message: searchError?.message,
              hasData: !!searchError?.data,
              dataKeys: searchError?.data ? Object.keys(searchError.data) : [],
              hasItems: !!searchError?.data?.searchScrapeURLs?.items,
              itemCount: searchError?.data?.searchScrapeURLs?.items?.length
            });
            
            // Check for partial success on search too
            if (searchError?.data?.searchScrapeURLs?.items) {
              items = searchError.data.searchScrapeURLs.items;
              nextToken = searchError.data.searchScrapeURLs.nextToken || null;
              console.log(`[scrapeURLService] searchScrapeURLs partial success: ${items.length} items`);
            } else {
              console.error('[scrapeURLService] Both queries failed completely, no usable data');
              return cache;
            }
          }
        }
      }
      
      // Filter and cache only the IDs we care about
      let itemsInRange = 0;
      let itemsOutOfRange = 0;
      for (const item of items) {
        if (item && item.tournamentId >= minId && item.tournamentId <= maxId) {
          cache[item.tournamentId] = item;
          itemsInRange++;
          // Log first few cached items for debugging
          if (Object.keys(cache).length <= 5) {
            console.log(`[scrapeURLService] Caching tournamentId ${item.tournamentId}:`, {
              gameStatus: item.gameStatus,
              lastScrapeStatus: item.lastScrapeStatus
            });
          }
        } else {
          itemsOutOfRange++;
        }
      }
      console.log(`[scrapeURLService] Batch filtering: ${itemsInRange} in range, ${itemsOutOfRange} out of range (looking for ${minId}-${maxId})`);
      
      // Log sample of out-of-range IDs if many filtered out
      if (itemsOutOfRange > 0 && items.length > 0) {
        const sampleOutOfRange = items
          .filter(i => i && (i.tournamentId < minId || i.tournamentId > maxId))
          .slice(0, 3)
          .map(i => i?.tournamentId);
        console.log(`[scrapeURLService] Sample out-of-range IDs:`, sampleOutOfRange);
      }
      
      // Stop if we've found all the IDs we need
      const cachedCount = Object.keys(cache).length;
      if (cachedCount >= tournamentIds.length) {
        break;
      }
      
    } while (nextToken);
    
    console.log(`[scrapeURLService] Prefetched ${Object.keys(cache).length} ScrapeURL statuses for range ${minId}-${maxId}`);
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
  // Only log when actually skipping
  if (result) {
    console.log(`[scrapeURLService] checkCachedNotPublished(${tournamentId}): SKIP (gameStatus=${entry?.gameStatus})`);
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
  if (!entry) {
    return false;
  }
  
  const status = entry.lastScrapeStatus?.toUpperCase();
  const result = status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE';
  // Only log when actually skipping
  if (result) {
    console.log(`[scrapeURLService] checkCachedNotFoundGap(${tournamentId}): SKIP (lastScrapeStatus=${entry.lastScrapeStatus})`);
  }
  return result;
};

export default {
  shouldSkipNotPublished,
  shouldSkipNotFoundGap,
  prefetchScrapeURLStatuses,
  checkCachedNotPublished,
  checkCachedNotFoundGap,
};