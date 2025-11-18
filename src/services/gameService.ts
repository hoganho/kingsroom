// services/gameService.ts
// Enhanced service with SaveGame mutation support for the new saveGameFunction Lambda

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData } from '../graphql/mutations';
import { fetchTournamentDataRange } from '../graphql/queries'; 
import * as APITypes from '../API';
import type { GameData, EntityConfig } from '../types/game';
import { 
    VenueAssignmentStatus, 
    ScrapedGameData, 
    DataSource,
    GameType,
    GameVariant,
    GameStatus,
    RegistrationStatus,
    GameFrequency,
    TournamentType,
    SaveGameResult
} from '../API';

// Default entity ID - should be fetched from Entity table or configured
const DEFAULT_ENTITY_ID = '42101695-1332-48e3-963b-3c6ad4e909a0';

// NEW: GraphQL mutation for saving game data via saveGameFunction
const saveGameMutation = /* GraphQL */ `
    mutation SaveGame($input: SaveGameInput!) {
        saveGame(input: $input) {
            success
            gameId
            action
            message
            warnings
            playerProcessingQueued
            playerProcessingReason
            venueAssignment {
                venueId
                venueName
                status
                confidence
            }
            fieldsUpdated
        }
    }
`;

// LEGACY: Custom saveTournamentData mutation (deprecated, kept for backward compatibility)
const saveTournamentDataCustom = /* GraphQL */ `
    mutation SaveTournamentData($input: SaveTournamentInput!) {
        saveTournamentData(input: $input) {
            id
            name
            gameStartDateTime
            gameEndDateTime
            gameStatus
            registrationStatus
            gameVariant
            gameType
            prizepool
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            venueId
            entityId
            venueAssignmentStatus
            requiresVenueAssignment
            suggestedVenueName
            venueAssignmentConfidence
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
    }
`;

/**
 * Get the current active entity from local storage or use default
 */
export const getCurrentEntityId = (): string => {
    const storedEntityId = localStorage.getItem('currentEntityId');
    if (storedEntityId) {
        return storedEntityId;
    }
    return DEFAULT_ENTITY_ID;
};

/**
 * Set the current active entity
 */
export const setCurrentEntityId = (entityId: string): void => {
    localStorage.setItem('currentEntityId', entityId);
};

/**
 * Fetch all available entities using auto-generated listEntities query
 */
export const fetchEntities = async (): Promise<EntityConfig[]> => {
    const client = generateClient();
    try {
        const response = await client.graphql({
            query: /* GraphQL */ `
                query ListEntities {
                    listEntities(filter: { isActive: { eq: true } }) {
                        items {
                            id
                            entityName
                            gameUrlDomain
                            gameUrlPath
                            entityLogo
                            isActive
                        }
                    }
                }
            `
        }) as GraphQLResult<any>;
        
        if (response.data?.listEntities?.items) {
            return response.data.listEntities.items as EntityConfig[];
        }
        return [];
    } catch (error) {
        console.error('[GameService] Error fetching entities:', error);
        return [];
    }
};

/**
 * Get entity ID from URL domain
 */
export const getEntityIdFromUrl = async (url: string): Promise<string> => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        const entities = await fetchEntities();
        const matchingEntity = entities.find(e => {
            try {
                const entityDomain = new URL(e.gameUrlDomain).hostname;
                return entityDomain === domain || entityDomain === `www.${domain}`;
            } catch {
                return e.gameUrlDomain === domain || `www.${e.gameUrlDomain}` === domain;
            }
        });
        
        if (matchingEntity) {
            console.log(`[GameService] Found entity for domain ${domain}: ${matchingEntity.id}`);
            return matchingEntity.id;
        }
        
        console.log(`[GameService] No entity found for domain ${domain}, using current entity from storage`);
        return getCurrentEntityId();
    } catch (error) {
        console.error('[GameService] Error determining entity from URL:', error);
        return getCurrentEntityId();
    }
};

/**
 * Calls the backend Lambda to fetch and parse tournament data without saving.
 */
export const fetchGameDataFromBackend = async (
    url: string,
    entityId?: string
): Promise<ScrapedGameData> => {
    const client = generateClient();
    console.log(`[GameService] Fetching data for ${url} from backend...`);
    
    try {
        const finalEntityId = entityId || (await getEntityIdFromUrl(url));
        console.log(`[GameService] Using entity ID: ${finalEntityId}`);
        
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: { url }
        }) as GraphQLResult<any>;

        if (response.errors) {
            if (response.errors[0].message.includes('Scraping is disabled')) {
                console.warn(`[GameService] Scraping disabled for ${url}`);
            }
            throw new Error(response.errors[0].message);
        }
        
        const data = response.data.fetchTournamentData as ScrapedGameData;
        
        if (!data.entityId) {
            data.entityId = finalEntityId;
        }
        
        console.log('[GameService] Successfully fetched data:', data);
        return data;
    } catch (error) {
        console.error('[GameService] Error fetching data from backend:', error);
        throw error;
    }
};

/**
 * Extract player data from scraped data for the SaveGameInput format
 */
const extractPlayersForSaveInput = (scrapedData: ScrapedGameData | GameData) => {
    if (!scrapedData) return undefined;

    const results = (scrapedData as any).results || [];
    const entries = (scrapedData as any).entries || [];
    const seating = (scrapedData as any).seating || [];
    
    const playerMap = new Map<string, {
        name: string;
        rank?: number | null;
        winnings?: number | null;
        points?: number | null;
        isQualification?: boolean | null;
        rebuys?: number | null;
        addons?: number | null;
    }>();

    // Results take priority (have rank/winnings)
    if (results.length > 0) {
        results.forEach((result: any) => {
            if (result?.name) {
                playerMap.set(result.name, {
                    name: result.name,
                    rank: result.rank,
                    winnings: result.winnings || 0,
                    points: result.points || 0,
                    isQualification: result.isQualification || false
                });
            }
        });
    } else {
        // Fall back to entries/seating
        entries.forEach((entry: any) => {
            if (entry?.name && !playerMap.has(entry.name)) {
                playerMap.set(entry.name, { 
                    name: entry.name,
                    rebuys: entry.reEntryCount || 0
                });
            }
        });
        seating.forEach((seat: any) => {
            if (seat?.name && !playerMap.has(seat.name)) {
                playerMap.set(seat.name, { name: seat.name });
            }
        });
    }

    const allPlayers = Array.from(playerMap.values());
    
    if (allPlayers.length === 0) return undefined;

    return {
        allPlayers,
        totalPlayers: allPlayers.length,
        hasCompleteResults: results.length > 0 && results.some((r: any) => r?.rank),
        hasEntryList: entries.length > 0,
        hasSeatingData: seating.length > 0
    };
};

/**
 * Map string values to enum types safely
 */
const mapToGameType = (value: string | undefined | null): GameType => {
    if (value === 'CASH_GAME') return GameType.CASH_GAME;
    return GameType.TOURNAMENT;
};

const mapToGameVariant = (value: string | undefined | null): GameVariant | undefined => {
    if (!value) return undefined;
    const variants: Record<string, GameVariant> = {
        'NLHE': GameVariant.NLHE,
        'PLO': GameVariant.PLO,
        'PLOM': GameVariant.PLOM,
        'PLO5': GameVariant.PLO5,
        'PLO6': GameVariant.PLO6
    };
    return variants[value] || GameVariant.NLHE;
};

const mapToGameStatus = (value: string | undefined | null): GameStatus => {
    if (!value) return GameStatus.SCHEDULED;
    const statuses: Record<string, GameStatus> = {
        'INITIATING': GameStatus.INITIATING,
        'SCHEDULED': GameStatus.SCHEDULED,
        'REGISTERING': GameStatus.REGISTERING,
        'RUNNING': GameStatus.RUNNING,
        'CANCELLED': GameStatus.CANCELLED,
        'FINISHED': GameStatus.FINISHED,
        'NOT_IN_USE': GameStatus.NOT_IN_USE,
        'NOT_PUBLISHED': GameStatus.NOT_PUBLISHED,
        'CLOCK_STOPPED': GameStatus.CLOCK_STOPPED,
        'UNKNOWN': GameStatus.UNKNOWN
    };
    return statuses[value] || GameStatus.SCHEDULED;
};

const mapToRegistrationStatus = (value: string | undefined | null): RegistrationStatus | undefined => {
    if (!value) return undefined;
    const statuses: Record<string, RegistrationStatus> = {
        'SCHEDULED': RegistrationStatus.SCHEDULED,
        'OPEN': RegistrationStatus.OPEN,
        'FINAL': RegistrationStatus.FINAL,
        'CLOSED': RegistrationStatus.CLOSED,
        'N_A': RegistrationStatus.N_A
    };
    return statuses[value];
};

const mapToGameFrequency = (value: string | undefined | null): GameFrequency | undefined => {
    if (!value) return undefined;
    const frequencies: Record<string, GameFrequency> = {
        'DAILY': GameFrequency.DAILY,
        'WEEKLY': GameFrequency.WEEKLY,
        'FORTNIGHTLY': GameFrequency.FORTNIGHTLY,
        'MONTHLY': GameFrequency.MONTHLY,
        'QUARTERLY': GameFrequency.QUARTERLY,
        'YEARLY': GameFrequency.YEARLY,
        'UNKNOWN': GameFrequency.UNKNOWN
    };
    return frequencies[value];
};

const mapToTournamentType = (value: string | undefined | null): TournamentType | undefined => {
    if (!value) return undefined;
    const types: Record<string, TournamentType> = {
        'FREEZEOUT': TournamentType.FREEZEOUT,
        'REBUY': TournamentType.REBUY,
        'SATELLITE': TournamentType.SATELLITE,
        'DEEPSTACK': TournamentType.DEEPSTACK
    };
    return types[value];
};

/**
 * NEW: Save game data using the saveGame mutation (via saveGameFunction Lambda)
 * 
 * This is the preferred method for saving game data. It:
 * - Validates input
 * - Resolves venue
 * - Creates/updates game in DynamoDB
 * - Tracks scrape attempts
 * - Queues for PDP if game is finished with results
 */
export const saveGameDataToBackend = async (
    sourceUrl: string, 
    venueId: string | null | undefined, 
    data: GameData | ScrapedGameData,
    existingGameId: string | null | undefined,
    entityId?: string | null
): Promise<SaveGameResult> => {
    const client = generateClient();
    console.log(`[GameService] Saving ${data.gameStatus} tournament data for ${sourceUrl} via saveGame mutation...`);
    
    // Determine entity ID
    const finalEntityId = entityId || (data as any).entityId || await getEntityIdFromUrl(sourceUrl);
    console.log(`[GameService] Using entity ID: ${finalEntityId}`);
    
    // Extract player data
    const playerData = extractPlayersForSaveInput(data);
    
    // Build SaveGameInput matching the schema
    const saveGameInput = {
        source: {
            type: DataSource.SCRAPE,
            sourceId: sourceUrl,
            entityId: finalEntityId,
            fetchedAt: new Date().toISOString(),
            contentHash: (data as any).contentHash || null
        },
        game: {
            tournamentId: data.tournamentId || null,
            existingGameId: existingGameId || null,
            name: data.name || `Tournament ${data.tournamentId}`,
            gameType: mapToGameType(data.gameType),
            gameVariant: mapToGameVariant(data.gameVariant),
            gameStatus: mapToGameStatus(data.gameStatus),
            gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
            gameEndDateTime: data.gameEndDateTime || null,
            registrationStatus: mapToRegistrationStatus(data.registrationStatus),
            gameFrequency: mapToGameFrequency((data as any).gameFrequency),
            buyIn: data.buyIn || 0,
            rake: data.rake || 0,
            guaranteeAmount: data.guaranteeAmount || 0,
            hasGuarantee: data.hasGuarantee || false,
            startingStack: data.startingStack || 0,
            prizepool: data.prizepool || 0,
            totalEntries: data.totalEntries || 0,
            totalRebuys: data.totalRebuys || 0,
            totalAddons: data.totalAddons || 0,
            tournamentType: mapToTournamentType(data.tournamentType),
            isSeries: (data as any).isSeries || false,
            seriesName: (data as any).seriesName || null,
            isSatellite: (data as any).isSatellite || false,
            gameTags: data.gameTags?.filter((tag): tag is string => tag !== null) || []
        },
        players: playerData,
        venue: {
            venueId: venueId || null,
            venueName: (data as any).venueName || null,
            suggestedVenueId: (data as any).venueMatch?.autoAssignedVenue?.id || null,
            confidence: (data as any).venueMatch?.suggestions?.[0]?.score || 0
        },
        options: {
            skipPlayerProcessing: false,
            forceUpdate: !!existingGameId,
            validateOnly: false,
            doNotScrape: data.doNotScrape || false
        }
    };

    console.log('[GameService] Calling saveGame mutation with input:', {
        sourceUrl,
        venueId,
        gameStatus: saveGameInput.game.gameStatus,
        playerCount: saveGameInput.players?.totalPlayers || 0,
        existingGameId
    });

    try {
        const response = await client.graphql({
            query: saveGameMutation,
            variables: { input: saveGameInput }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            console.error('[GameService] GraphQL errors:', response.errors);
            throw new Error(response.errors[0]?.message || 'Failed to save game data');
        }

        const result = response.data.saveGame as SaveGameResult;
        
        console.log('[GameService] Save result:', {
            success: result.success,
            action: result.action,
            gameId: result.gameId,
            playerProcessingQueued: result.playerProcessingQueued,
            playerProcessingReason: result.playerProcessingReason
        });

        if (!result.success) {
            throw new Error(result.message || 'Save operation failed');
        }

        return result;
    } catch (error) {
        console.error('[GameService] Error saving game data:', error);
        throw error;
    }
};

/**
 * LEGACY: Save using the old saveTournamentData mutation
 * @deprecated Use saveGameDataToBackend instead
 */
export const saveGameDataToBackendLegacy = async (
    sourceUrl: string, 
    venueId: string | null | undefined, 
    data: GameData,
    existingGameId: string | null | undefined,
    entityId?: string | null
): Promise<APITypes.Game> => {
    console.warn('[GameService] Using deprecated saveTournamentData mutation. Please migrate to saveGameDataToBackend.');
    
    const client = generateClient();
    const finalEntityId = entityId || data.entityId || await getEntityIdFromUrl(sourceUrl);
    
    let assignmentStatus: VenueAssignmentStatus;
    if (venueId) {
        assignmentStatus = VenueAssignmentStatus.MANUALLY_ASSIGNED;
    } else if (data.venueMatch?.autoAssignedVenue?.id) {
        assignmentStatus = VenueAssignmentStatus.AUTO_ASSIGNED;
    } else {
        assignmentStatus = VenueAssignmentStatus.PENDING_ASSIGNMENT;
    }

    try {
        const input: APITypes.SaveTournamentInput = {
            sourceUrl,
            venueId: venueId,
            entityId: finalEntityId,
            existingGameId: existingGameId,
            doNotScrape: data.doNotScrape ?? false,
            originalScrapedData: JSON.stringify(data),
            venueAssignmentStatus: assignmentStatus,
            requiresVenueAssignment: !venueId,
            suggestedVenueName: data.venueMatch?.suggestions?.[0]?.name ?? undefined,
            venueAssignmentConfidence: data.venueMatch?.suggestions?.[0]?.score ?? undefined,
            data: {
                name: data.name,
                gameStartDateTime: data.gameStartDateTime ?? undefined,
                gameEndDateTime: data.gameEndDateTime ?? undefined,
                gameStatus: data.gameStatus,
                registrationStatus: data.registrationStatus,
                gameVariant: data.gameVariant ?? APITypes.GameVariant.NLHE,
                gameType: data.gameType,
                prizepool: data.prizepool,
                totalEntries: data.totalEntries,
                totalRebuys: data.totalRebuys,
                totalAddons: data.totalAddons,
                totalDuration: data.totalDuration,
                gameTags: data.gameTags?.filter((tag): tag is string => tag !== null),
                tournamentType: data.tournamentType,
                buyIn: data.buyIn,
                rake: data.rake,
                startingStack: data.startingStack,
                hasGuarantee: data.hasGuarantee,
                guaranteeAmount: data.guaranteeAmount,
                levels: data.levels?.map(l => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes,
                    smallBlind: l.smallBlind,
                    bigBlind: l.bigBlind,
                    ante: l.ante ?? undefined,
                    breakMinutes: l.breakMinutes ?? undefined,
                })) || [],
            },
        };

        const response = await client.graphql({
            query: saveTournamentDataCustom,
            variables: { input }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(JSON.stringify(response.errors));
        }

        return response.data.saveTournamentData as APITypes.Game;
    } catch (error) {
        console.error('[GameService] Error saving to DB (legacy):', error);
        throw error;
    }
};

/**
 * Helper function to determine if a tournament should be auto-refreshed
 */
export const shouldAutoRefreshTournament = (data: GameData): boolean => {
    if (data.doNotScrape) {
        return false;
    }
    return data.gameStatus === 'RUNNING';
};

/**
 * Fetch game data range from backend
 */
export const fetchGameDataRangeFromBackend = async (
    startId: number, 
    endId: number,
    entityId?: string
) => {
    const client = generateClient();
    const finalEntityId = entityId || getCurrentEntityId();
    
    console.log(`[GameService] Fetching game range ${startId}-${endId} for entity ${finalEntityId} from backend...`);
    
    try {
        const response = await client.graphql({
            query: fetchTournamentDataRange,
            variables: { startId, endId }
        }) as GraphQLResult<any>;

        if (response.errors) {
            throw new Error(response.errors[0].message);
        }
        
        return response.data.fetchTournamentDataRange;
    } catch (error) {
        console.error('Error fetching game data range from backend:', error);
        throw error;
    }
};

/**
 * Helper to validate that all required entity fields are present
 */
export const validateEntityData = (data: GameData, entityId?: string): string[] => {
    const errors: string[] = [];
    
    if (!entityId && !data.entityId) {
        errors.push('Entity ID is required but not provided');
    }
    
    return errors;
};

/**
 * Batch save games with entity validation
 */
export const batchSaveGamesWithEntity = async (
    games: Array<{
        sourceUrl: string;
        venueId?: string;
        data: GameData;
        existingGameId?: string;
    }>,
    entityId?: string
): Promise<Array<SaveGameResult | { error: string }>> => {
    const results = [];
    const finalEntityId = entityId || getCurrentEntityId();
    
    for (const game of games) {
        try {
            const validationErrors = validateEntityData(game.data, finalEntityId);
            if (validationErrors.length > 0) {
                results.push({ error: validationErrors.join(', ') });
                continue;
            }
            
            const saved = await saveGameDataToBackend(
                game.sourceUrl,
                game.venueId,
                game.data,
                game.existingGameId,
                finalEntityId
            );
            
            results.push(saved);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.push({ error: errorMessage });
        }
    }
    
    return results;
};