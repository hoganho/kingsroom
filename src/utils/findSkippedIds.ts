// src/utils/findSkippedIds.ts
// Utility to find gaps in tournament ID sequences

import { generateClient } from 'aws-amplify/api';
import { scraperManagementQueries } from '../graphql/scraperManagement';
import { listGames } from '../graphql/queries';

export interface SkippedIDRange {
    start: number;
    end: number;
    count: number;
}

export interface SkippedIDsResult {
    skippedRanges: SkippedIDRange[];
    totalSkipped: number;
    scannedRange: { min: number; max: number };
    foundIds: Set<number>;
}

/**
 * Find all tournament IDs that have been skipped in the scraping process
 * @param entityId - The entity to check for skipped IDs
 * @param options - Options for the search
 */
export const findSkippedTournamentIds = async (
    entityId: string,
    options: {
        startId?: number;
        endId?: number;
        maxGapsToReturn?: number;
        checkGames?: boolean;
        checkScrapeURLs?: boolean;
    } = {}
): Promise<SkippedIDsResult> => {
    const client = generateClient();
    const {
        startId = 1,
        endId,
        maxGapsToReturn = 100,
        checkGames = true,
        checkScrapeURLs = true
    } = options;
    
    console.log(`[SkippedIDs] Starting analysis for entity ${entityId}...`);
    
    // Step 1: Determine the range to check
    let maxId = endId || 0;
    
    // Get lastScannedId from ScraperState if not provided
    if (!endId) {
        try {
            const scraperStateResponse = await client.graphql({
                query: scraperManagementQueries.getScraperControlStateCustom,
                variables: { entityId }
            }) as any;
            
            const state = scraperStateResponse.data?.getScraperControlState?.state;
            if (state?.lastScannedId) {
                maxId = state.lastScannedId;
                console.log(`[SkippedIDs] Found lastScannedId: ${maxId}`);
            }
        } catch (error) {
            console.log('[SkippedIDs] Could not fetch ScraperState');
        }
    }
    
    // Step 2: Collect all existing IDs
    const foundIds = new Set<number>();
    
    // Check ScrapeURLs
    if (checkScrapeURLs) {
        console.log('[SkippedIDs] Checking ScrapeURLs...');
        let nextToken = null;
        let iterations = 0;
        
        do {
            try {
                const response = await client.graphql({
                    query: scraperManagementQueries.listScrapeURLsCustom,
                    variables: {
                        entityId,
                        limit: 100,
                        nextToken
                    }
                }) as any;
                
                const items = response.data?.listScrapeURLs?.items || [];
                items.forEach((item: any) => {
                    if (item.tournamentId) {
                        foundIds.add(item.tournamentId);
                    }
                });
                
                nextToken = response.data?.listScrapeURLs?.nextToken;
                iterations++;
                
                if (iterations >= 50) {
                    console.log('[SkippedIDs] Reached max iterations for ScrapeURLs');
                    break;
                }
            } catch (error) {
                console.error('[SkippedIDs] Error fetching ScrapeURLs:', error);
                break;
            }
        } while (nextToken);
        
        console.log(`[SkippedIDs] Found ${foundIds.size} IDs in ScrapeURLs`);
    }
    
    // Check Games table
    if (checkGames) {
        console.log('[SkippedIDs] Checking Games table...');
        let nextToken = null;
        let iterations = 0;
        
        do {
            try {
                const response = await client.graphql({
                    query: listGames,
                    variables: {
                        filter: {
                            entityId: { eq: entityId }
                        },
                        limit: 100,
                        nextToken
                    }
                }) as any;
                
                const items = response.data?.listGames?.items || [];
                items.forEach((game: any) => {
                    // Check tournamentId field
                    if (game.tournamentId) {
                        foundIds.add(game.tournamentId);
                    }
                    // Also extract from sourceUrl
                    if (game.sourceUrl) {
                        const match = game.sourceUrl.match(/id=(\d+)/);
                        if (match) {
                            const id = parseInt(match[1]);
                            if (!isNaN(id)) {
                                foundIds.add(id);
                            }
                        }
                    }
                });
                
                nextToken = response.data?.listGames?.nextToken;
                iterations++;
                
                if (iterations >= 20) {
                    console.log('[SkippedIDs] Reached max iterations for Games');
                    break;
                }
            } catch (error) {
                console.error('[SkippedIDs] Error fetching Games:', error);
                break;
            }
        } while (nextToken);
        
        console.log(`[SkippedIDs] Total IDs found: ${foundIds.size}`);
    }
    
    // If we still don't have a max, use the highest found ID
    if (maxId === 0 && foundIds.size > 0) {
        maxId = Math.max(...foundIds);
        console.log(`[SkippedIDs] Using highest found ID as max: ${maxId}`);
    }
    
    // Step 3: Find gaps in the sequence
    const skippedRanges: SkippedIDRange[] = [];
    let currentGapStart: number | null = null;
    let totalSkipped = 0;
    
    for (let id = startId; id <= maxId; id++) {
        if (!foundIds.has(id)) {
            if (currentGapStart === null) {
                currentGapStart = id;
            }
            totalSkipped++;
        } else {
            if (currentGapStart !== null) {
                // End of a gap
                const gapEnd = id - 1;
                skippedRanges.push({
                    start: currentGapStart,
                    end: gapEnd,
                    count: gapEnd - currentGapStart + 1
                });
                currentGapStart = null;
                
                // Limit the number of gaps returned
                if (skippedRanges.length >= maxGapsToReturn) {
                    console.log(`[SkippedIDs] Reached max gaps limit (${maxGapsToReturn})`);
                    break;
                }
            }
        }
    }
    
    // Handle gap that extends to the end
    if (currentGapStart !== null) {
        const gapEnd = maxId;
        skippedRanges.push({
            start: currentGapStart,
            end: gapEnd,
            count: gapEnd - currentGapStart + 1
        });
    }
    
    console.log(`[SkippedIDs] Found ${skippedRanges.length} gaps with ${totalSkipped} total missing IDs`);
    
    return {
        skippedRanges,
        totalSkipped,
        scannedRange: { min: startId, max: maxId },
        foundIds
    };
};

/**
 * Generate URLs for skipped tournament IDs
 */
export const generateURLsForSkippedIds = (
    skippedRanges: SkippedIDRange[],
    entityConfig: { gameUrlDomain: string; gameUrlPath: string }
): string[] => {
    const urls: string[] = [];
    
    for (const range of skippedRanges) {
        for (let id = range.start; id <= range.end; id++) {
            const url = `${entityConfig.gameUrlDomain}${entityConfig.gameUrlPath}?id=${id}`;
            urls.push(url);
        }
    }
    
    return urls;
};

/**
 * Get a summary of skipped IDs for display
 */
export const getSkippedIdsSummary = (result: SkippedIDsResult): string => {
    if (result.totalSkipped === 0) {
        return `No skipped IDs found in range ${result.scannedRange.min}-${result.scannedRange.max}`;
    }
    
    const largestGap = result.skippedRanges.reduce((max, range) => 
        range.count > max.count ? range : max, 
        result.skippedRanges[0]
    );
    
    return `Found ${result.totalSkipped} skipped IDs in ${result.skippedRanges.length} gaps. ` +
           `Largest gap: ${largestGap.start}-${largestGap.end} (${largestGap.count} IDs)`;
};