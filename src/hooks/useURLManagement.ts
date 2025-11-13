// src/hooks/useURLManagement.ts
// Unified hook for managing URLs and their HTML storage
// Serves as the frontend interface for the Single Source of Truth (ScrapeURL)

import { useState, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import type { 
    S3Storage,
        ScrapeURLStatus 
} from '../API';

const client = generateClient();

// Define the enum locally since it's not generated in API.ts
export enum URLInteractionType {
    SCRAPED_WITH_HTML = 'SCRAPED_WITH_HTML',
    SCRAPED_NOT_PUBLISHED = 'SCRAPED_NOT_PUBLISHED',
    SCRAPED_NOT_IN_USE = 'SCRAPED_NOT_IN_USE',
    SCRAPED_ERROR = 'SCRAPED_ERROR',
    MANUAL_UPLOAD = 'MANUAL_UPLOAD',
    NEVER_CHECKED = 'NEVER_CHECKED'
}

export interface URLKnowledge {
    id: string;
    url: string;
    tournamentId: number;
    entityId: string;
    lastInteractionType: URLInteractionType;
    lastInteractionAt: string;
    hasStoredContent: boolean;
    latestS3StorageId?: string;
    doNotScrape: boolean;
    status: ScrapeURLStatus;
    gameName?: string;
    gameStatus?: string;
    gameId?: string;
    totalInteractions: number;
    successfulScrapes: number;
    failedScrapes: number;
    manualUploads: number;
    lastError?: string;
    storageHistory?: S3Storage[];
}

export interface URLQueryOptions {
    url?: string;
    tournamentId?: number;
    entityId?: string;
    includeStorageHistory?: boolean;
    limit?: number;
}

export interface URLStatistics {
    totalURLs: number;
    withHTML: number;
    notPublished: number;
    notInUse: number;
    errors: number;
    manualUploads: number;
    neverChecked: number;
    coverageRate: string;
    successRate: string;
}

export interface ManualUploadOptions {
    fileContent: string;
    fileName?: string;
    sourceUrl: string;
    entityId: string;
    tournamentId?: number;
    uploadedBy?: string;
    notes?: string;
}

export interface ScrapeOptions {
    url: string;
    entityId: string;
    skipCache?: boolean;
    forceRefresh?: boolean;
}

export const useURLManagement = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [urls, setUrls] = useState<URLKnowledge[]>([]);
    const [statistics, _setStatistics] = useState<URLStatistics | null>(null);

    /**
     * Check what we know about a URL (Single Source of Truth Query)
     */
    const checkURL = useCallback(async (url: string): Promise<URLKnowledge | null> => {
        setLoading(true);
        setError(null);

        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query CheckURL($url: String!) {
                        scrapeURLByURL(url: $url) {
                            items {
                                id
                                url
                                tournamentId
                                entityId
                                lastInteractionType
                                lastInteractionAt
                                hasStoredContent
                                latestS3StorageId
                                doNotScrape
                                status
                                gameName
                                gameStatus
                                gameId
                                totalInteractions
                                successfulScrapes
                                failedScrapes
                                manualUploads
                                lastError
                                createdAt
                                updatedAt
                            }
                        }
                    }
                `,
                variables: { url }
            }) as GraphQLResult<any>;

            const items = response.data?.scrapeURLByURL?.items;
            
            if (items && items.length > 0) {
                return items[0] as URLKnowledge;
            }
            
            return null; // URL not in system yet
        } catch (err) {
            console.error('[useURLManagement] Error checking URL:', err);
            setError(err instanceof Error ? err.message : 'Failed to check URL');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Query URLs with various filters
     */
    const queryURLs = useCallback(async (options: URLQueryOptions): Promise<URLKnowledge[]> => {
        setLoading(true);
        setError(null);

        try {
            let query;
            let variables: any = {};

            if (options.url) {
                query = /* GraphQL */ `
                    query QueryByURL($url: String!) {
                        scrapeURLByURL(url: $url) {
                            items {
                                id
                                url
                                tournamentId
                                entityId
                                lastInteractionType
                                lastInteractionAt
                                hasStoredContent
                                latestS3StorageId
                                doNotScrape
                                status
                                gameName
                                gameStatus
                                gameId
                                totalInteractions
                                successfulScrapes
                                failedScrapes
                                manualUploads
                                lastError
                            }
                        }
                    }
                `;
                variables = { url: options.url };

            } else if (options.entityId) {
                query = /* GraphQL */ `
                    query QueryByEntity($entityId: ID!, $limit: Int) {
                        listScrapeURLsByEntity(
                            entityId: $entityId,
                            sortDirection: DESC,
                            limit: $limit
                        ) {
                            items {
                                id
                                url
                                tournamentId
                                entityId
                                lastInteractionType
                                lastInteractionAt
                                hasStoredContent
                                latestS3StorageId
                                doNotScrape
                                status
                                gameName
                                gameStatus
                                gameId
                                totalInteractions
                                successfulScrapes
                                failedScrapes
                                manualUploads
                                lastError
                            }
                        }
                    }
                `;
                variables = {
                    entityId: options.entityId,
                    limit: options.limit || 50
                };
            } else if (options.tournamentId) {
                query = /* GraphQL */ `
                    query QueryByTournament($tournamentId: Int!, $limit: Int) {
                        listScrapeURLsByTournamentId(
                            tournamentId: $tournamentId,
                            limit: $limit
                        ) {
                            items {
                                id
                                url
                                tournamentId
                                entityId
                                lastInteractionType
                                lastInteractionAt
                                hasStoredContent
                                latestS3StorageId
                                doNotScrape
                                status
                                gameName
                                gameStatus
                                gameId
                                totalInteractions
                                successfulScrapes
                                failedScrapes
                                manualUploads
                                lastError
                            }
                        }
                    }
                `;
                variables = {
                    tournamentId: options.tournamentId,
                    limit: options.limit || 10
                };
            } else {
                throw new Error('Must provide url, entityId, or tournamentId');
            }

            const response = await client.graphql({ query, variables }) as GraphQLResult<any>;
            const queryKey = Object.keys(response.data)[0];
            const fetchedURLs = response.data[queryKey]?.items || [];
            
            if (options.includeStorageHistory && fetchedURLs.length > 0) {
                for (const urlItem of fetchedURLs) {
                    if (urlItem.id) { // scrapeURL ID is the URL itself in some contexts, or a UUID
                        const storageResponse = await client.graphql({
                            query: /* GraphQL */ `
                                query GetStorageHistory($scrapeURLId: ID!) {
                                    listS3StoragesByScrapeURL(
                                        scrapeURLId: $scrapeURLId,
                                        sortDirection: DESC,
                                        limit: 5
                                    ) {
                                        items {
                                            id
                                            s3Key
                                            s3Bucket
                                            contentSize
                                            contentHash
                                            source
                                            storedAt
                                            extractedTitle
                                            extractedGameStatus
                                            isParsed
                                            wasGameCreated
                                        }
                                    }
                                }
                            `,
                            variables: { scrapeURLId: urlItem.id }
                        }) as GraphQLResult<any>;
                        
                        urlItem.storageHistory = storageResponse.data?.listS3StoragesByScrapeURL?.items || [];
                    }
                }
            }
            
            setUrls(fetchedURLs);
            return fetchedURLs;

        } catch (err) {
            console.error('[useURLManagement] Error querying URLs:', err);
            setError(err instanceof Error ? err.message : 'Failed to query URLs');
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Manual HTML upload - Updates ScrapeURL source of truth
     */
    const uploadManualHTML = useCallback(async (options: ManualUploadOptions): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation UploadManualHTML($input: ManualHTMLUploadInput!) {
                        uploadManualHTML(input: $input) {
                            id
                            scrapeURLId
                            s3Key
                            contentHash
                            source
                            storedAt
                        }
                    }
                `,
                variables: {
                    input: {
                        htmlContent: options.fileContent,
                        url: options.sourceUrl,
                        tournamentId: options.tournamentId || extractTournamentId(options.sourceUrl),
                        entityId: options.entityId,
                        notes: options.notes,
                        uploadedBy: options.uploadedBy || 'user'
                    }
                }
            }) as GraphQLResult<any>;

            return !!response.data?.uploadManualHTML;
        } catch (err) {
            console.error('[useURLManagement] Error uploading HTML:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload HTML');
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Scrape a URL - Triggers the Unified AutoScraper logic
     */
    const scrapeURL = useCallback(async (options: ScrapeOptions): Promise<any> => {
        setLoading(true);
        setError(null);

        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation FetchTournamentData($url: String!, $forceRefresh: Boolean) {
                        fetchTournamentData(url: $url, forceRefresh: $forceRefresh) {
                            name
                            gameStatus
                            registrationStatus
                            tournamentId
                            entityId
                            s3Key
                            interactionType
                            scrapeURLId
                            source
                        }
                    }
                `,
                variables: { 
                    url: options.url,
                    forceRefresh: options.forceRefresh 
                }
            }) as GraphQLResult<any>;

            return response.data?.fetchTournamentData;
        } catch (err) {
            console.error('[useURLManagement] Error scraping URL:', err);
            setError(err instanceof Error ? err.message : 'Failed to scrape URL');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Get HTML content from S3 via S3Storage ID or Key
     */
    const getHTMLContent = useCallback(async (s3StorageIdOrKey: string): Promise<string | null> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query ViewS3Content($s3Key: String!) {
                        viewS3Content(s3Key: $s3Key) {
                            html
                            metadata
                            size
                            lastModified
                        }
                    }
                `,
                variables: { s3Key: s3StorageIdOrKey }
            }) as GraphQLResult<any>;

            return response.data?.viewS3Content?.html || null;
        } catch (err) {
            console.error('[useURLManagement] Error getting HTML:', err);
            return null;
        }
    }, []);

    /**
     * Update URL settings (doNotScrape, status, etc.)
     */
    const updateURLSettings = useCallback(async (
        urlId: string, 
        settings: { doNotScrape?: boolean; status?: ScrapeURLStatus }
    ): Promise<boolean> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation UpdateScrapeURL($id: ID!, $input: UpdateScrapeURLInput!) {
                        updateScrapeURL(id: $id, input: $input) {
                            id
                            doNotScrape
                            status
                        }
                    }
                `,
                variables: {
                    id: urlId,
                    input: settings
                }
            }) as GraphQLResult<any>;

            return !!response.data?.updateScrapeURL;
        } catch (err) {
            console.error('[useURLManagement] Error updating URL:', err);
            return false;
        }
    }, []);

    /**
     * Helper to determine if we should scrape based on unified rules
     */
    const shouldScrape = useCallback((url: URLKnowledge, maxAgeMinutes: number = 5): boolean => {
        if (url.doNotScrape) return false;
        if (!url.hasStoredContent) return true;
        
        const age = Date.now() - new Date(url.lastInteractionAt).getTime();
        const ageMinutes = age / (1000 * 60);
        
        switch (url.lastInteractionType) {
            case 'SCRAPED_WITH_HTML':
            case 'MANUAL_UPLOAD':
                return ageMinutes > maxAgeMinutes;
            case 'SCRAPED_NOT_PUBLISHED':
                return ageMinutes > 60; 
            case 'SCRAPED_NOT_IN_USE':
                return ageMinutes > 1440; 
            case 'SCRAPED_ERROR':
                return ageMinutes > 15; 
            default:
                return true;
        }
    }, []);

    return {
        loading,
        error,
        urls,
        statistics,
        checkURL,
        queryURLs,
        uploadManualHTML,
        scrapeURL,
        getHTMLContent,
        updateURLSettings,
        shouldScrape
    };
};

function extractTournamentId(url: string): number | undefined {
    const match = url.match(/[?&]id=(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
}