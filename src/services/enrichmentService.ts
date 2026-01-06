// services/enrichmentService.ts
// ===================================================================
// ENRICHMENT SERVICE - COMPLETE WITH PIPELINE FUNCTIONS
// ===================================================================

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import {
  enrichGameDataMutation,
  previewEnrichmentQuery,
  enrichmentPreviewLite,
} from '../graphql/enrichmentOperations';
import type {
  EnrichGameDataInput,
  EnrichGameDataOutput,
  EnrichPlayerDataInput,
  EnrichPlayerInput,
  EnrichmentSaveResult,
  EnrichedGameData,
  EnrichedGameDataWithContext,
  PipelineEnrichmentResult,
} from '../types/enrichment';
import type { ScrapedGameData } from '../API';
import type { GameType, GameVariant, GameStatus, RegistrationStatus, GameFrequency, TournamentType } from '../API';

// ===================================================================
// CORE ENRICHMENT FUNCTIONS
// ===================================================================

/**
 * Enrich game data with preview or save mode
 */
export const enrichGameData = async (
  input: EnrichGameDataInput
): Promise<EnrichGameDataOutput> => {
  const client = generateClient();
  
  console.log('[EnrichmentService] Enriching game data:', {
    entityId: input.entityId,
    name: input.game.name,
    saveToDatabase: input.options?.saveToDatabase ?? false,
    hasSource: !!input.source,
    hasVenue: !!input.venue,
    hasSeries: !!input.series,
    hasPlayers: !!input.players,
  });
  
  try {
    // Cast input to any to avoid type mismatch between local types and API.ts types
    const response = await client.graphql({
      query: enrichGameDataMutation,
      variables: { input: input as any }
    }) as GraphQLResult<{ enrichGameData: EnrichGameDataOutput }>;
    
    if (response.errors?.length) {
      console.error('[EnrichmentService] GraphQL errors:', response.errors);
      throw new Error(response.errors[0]?.message || 'Enrichment failed');
    }
    
    const result = response.data?.enrichGameData;
    
    if (!result) {
      throw new Error('No response from enrichGameData');
    }
    
    console.log('[EnrichmentService] Enrichment result:', {
      success: result.success,
      isValid: result.validation?.isValid,
      errorCount: result.validation?.errors?.length ?? 0,
      warningCount: result.validation?.warnings?.length ?? 0,
      saveAction: result.saveResult?.action,
      gameId: result.saveResult?.gameId,
      processingTimeMs: result.enrichmentMetadata?.processingTimeMs,
    });
    
    return result;
    
  } catch (error: unknown) {
    console.error('[EnrichmentService] Error:', error);
    
    const err = error as { errors?: Array<{ message?: string }>; message?: string };
    const message = err?.errors?.[0]?.message || 
                   err?.message || 
                   'Unknown enrichment error';
    
    throw new Error(message);
  }
};

/**
 * Preview enrichment without any side effects
 */
export const previewEnrichment = async (
  input: EnrichGameDataInput
): Promise<EnrichGameDataOutput> => {
  const client = generateClient();
  
  const previewInput: EnrichGameDataInput = {
    ...input,
    options: {
      ...input.options,
      saveToDatabase: false,
      autoCreateSeries: false,
      autoCreateRecurring: false,
    }
  };
  
  console.log('[EnrichmentService] Previewing enrichment:', {
    entityId: input.entityId,
    name: input.game.name,
  });
  
  try {
    const response = await client.graphql({
      query: previewEnrichmentQuery,
      variables: { input: previewInput }
    }) as GraphQLResult<{ previewEnrichment: EnrichGameDataOutput }>;
    
    if (response.errors?.length) {
      console.error('[EnrichmentService] Preview errors:', response.errors);
      throw new Error(response.errors[0]?.message || 'Preview failed');
    }
    
    return response.data?.previewEnrichment!;
    
  } catch (error: unknown) {
    console.error('[EnrichmentService] Preview error:', error);
    throw new Error((error as Error)?.message || 'Preview failed');
  }
};

/**
 * Quick enrichment preview with minimal fields
 */
export const quickEnrichmentPreview = async (
  input: EnrichGameDataInput
): Promise<EnrichGameDataOutput> => {
  const client = generateClient();
  
  const previewInput: EnrichGameDataInput = {
    ...input,
    options: {
      saveToDatabase: false,
      validateOnly: true,
      skipQueryKeys: true,
    }
  };
  
  try {
    const response = await client.graphql({
      query: enrichmentPreviewLite,
      variables: { input: previewInput }
    }) as GraphQLResult<{ enrichGameData: EnrichGameDataOutput }>;
    
    return response.data?.enrichGameData!;
    
  } catch (error: unknown) {
    console.error('[EnrichmentService] Quick preview error:', error);
    throw new Error((error as Error)?.message || 'Quick preview failed');
  }
};

/**
 * Enrich and save in one call
 */
export const enrichAndSaveGame = async (
  input: EnrichGameDataInput
): Promise<EnrichGameDataOutput> => {
  if (!input.source) {
    throw new Error('source is required for save operation');
  }
  
  if (!input.entityId) {
    throw new Error('entityId is required for save operation');
  }
  
  const saveInput: EnrichGameDataInput = {
    ...input,
    options: {
      ...input.options,
      saveToDatabase: true,
    }
  };
  
  return enrichGameData(saveInput);
};

// ===================================================================
// CONVERSION HELPERS
// ===================================================================

/**
 * Convert ScrapedGameData to EnrichGameDataInput
 */
export const scrapedDataToEnrichInput = (
  scrapedData: ScrapedGameData,
  entityId: string,
  sourceUrl: string,
  options?: {
    venueId?: string | null;
    existingGameId?: string | null;
    wasEdited?: boolean;
    doNotScrape?: boolean;
  }
): EnrichGameDataInput => {
  const players = extractPlayerData(scrapedData);
  const dataAsAny = scrapedData as Record<string, unknown>;
  
  // Helper to convert null to undefined for optional fields
  const nullToUndefined = <T>(val: T | null | undefined): T | undefined => 
    val === null ? undefined : val;
  
  const input: EnrichGameDataInput = {
    entityId,
    
    source: {
      type: 'SCRAPE',
      sourceId: sourceUrl,
      entityId,
      fetchedAt: new Date().toISOString(),
      contentHash: (dataAsAny.contentHash as string | null) ?? undefined,
      wasEdited: options?.wasEdited || false,
    },
    
    game: {
      tournamentId: scrapedData.tournamentId,
      existingGameId: nullToUndefined(options?.existingGameId),
      name: scrapedData.name || `Tournament ${scrapedData.tournamentId}`,
      gameType: (scrapedData.gameType as GameType) || 'TOURNAMENT',
      gameVariant: mapGameVariant(scrapedData.gameVariant),
      gameStatus: scrapedData.gameStatus as GameStatus,
      registrationStatus: scrapedData.registrationStatus as RegistrationStatus,
      gameStartDateTime: scrapedData.gameStartDateTime || new Date().toISOString(),
      gameEndDateTime: nullToUndefined(scrapedData.gameEndDateTime),
      gameFrequency: nullToUndefined(dataAsAny.gameFrequency as GameFrequency | null),
      
      // Financials
      buyIn: scrapedData.buyIn ?? 0,
      rake: scrapedData.rake ?? 0,
      venueFee: nullToUndefined(dataAsAny.venueFee as number | null),
      startingStack: scrapedData.startingStack ?? 0,
      hasGuarantee: scrapedData.hasGuarantee ?? false,
      guaranteeAmount: scrapedData.guaranteeAmount ?? 0,
      
      // Entries
      totalUniquePlayers: scrapedData.totalUniquePlayers ?? players.totalUniquePlayers,
      totalInitialEntries: scrapedData.totalInitialEntries ?? 0,
      totalEntries: scrapedData.totalEntries ?? 0,
      totalRebuys: scrapedData.totalRebuys ?? 0,
      totalAddons: scrapedData.totalAddons ?? 0,
      
      // Results
      prizepoolPaid: scrapedData.prizepoolPaid ?? 0,
      prizepoolCalculated: scrapedData.prizepoolCalculated ?? 0,
      playersRemaining: nullToUndefined(dataAsAny.playersRemaining as number | null),
      totalChipsInPlay: nullToUndefined(dataAsAny.totalChipsInPlay as number | null),
      averagePlayerStack: nullToUndefined(dataAsAny.averagePlayerStack as number | null),
      totalDuration: nullToUndefined(dataAsAny.totalDuration as number | null),
      
      // Classification
      tournamentType: nullToUndefined(dataAsAny.tournamentType as TournamentType | null),
      isSeries: (dataAsAny.isSeries as boolean) ?? false,
      seriesName: nullToUndefined(dataAsAny.seriesName as string | null),
      isSatellite: (dataAsAny.isSatellite as boolean) ?? false,
      isRegular: (dataAsAny.isRegular as boolean) ?? false,
      gameTags: (scrapedData.gameTags?.filter(Boolean) as string[]) ?? [],
      
      // Series metadata
      isMainEvent: (dataAsAny.isMainEvent as boolean) ?? false,
      eventNumber: nullToUndefined(dataAsAny.eventNumber as number | null),
      dayNumber: nullToUndefined(dataAsAny.dayNumber as number | null),
      flightLetter: nullToUndefined(dataAsAny.flightLetter as string | null),
      finalDay: (dataAsAny.finalDay as boolean) ?? false,
      
      // Recurring
      recurringGameId: nullToUndefined(dataAsAny.recurringGameId as string | null),
      
      // Structure
      levels: scrapedData.levels ? JSON.stringify(scrapedData.levels) : undefined,
    },
    
    venue: {
      venueId: nullToUndefined(options?.venueId),
      venueName: nullToUndefined(dataAsAny.venueName as string | null),
      suggestedVenueId: scrapedData.venueMatch?.autoAssignedVenue?.id ?? undefined,
      confidence: scrapedData.venueMatch?.autoAssignedVenue?.score || 0,
    },
    
    series: dataAsAny.isSeries ? {
      tournamentSeriesId: nullToUndefined(dataAsAny.tournamentSeriesId as string | null),
      seriesTitleId: nullToUndefined(dataAsAny.seriesTitleId as string | null),
      seriesName: nullToUndefined(dataAsAny.seriesName as string | null),
      year: (dataAsAny.seriesYear as number) || new Date().getFullYear(),
      isMainEvent: (dataAsAny.isMainEvent as boolean) || false,
      eventNumber: nullToUndefined(dataAsAny.eventNumber as number | null),
      dayNumber: nullToUndefined(dataAsAny.dayNumber as number | null),
      flightLetter: nullToUndefined(dataAsAny.flightLetter as string | null),
      finalDay: (dataAsAny.finalDay as boolean) || false,
    } : undefined,
    
    players: players.totalUniquePlayers > 0 ? players : undefined,
    
    // Only include fields that exist in your EnrichmentOptionsInput schema
    // doNotScrape is NOT a valid option field - removed
    options: {
      saveToDatabase: false,
      autoCreateSeries: true,
      autoCreateRecurring: true,
      forceUpdate: !!options?.existingGameId || options?.wasEdited,
    },
  };
  
  return input;
};

/**
 * Extract player data from scraped data
 */
const extractPlayerData = (data: ScrapedGameData): EnrichPlayerDataInput => {
  const playerMap = new Map<string, EnrichPlayerInput>();
  
  if (data.results?.length) {
    data.results.forEach(result => {
      if (result.name) {
        playerMap.set(result.name.toLowerCase(), {
          name: result.name,
          rank: result.rank ?? undefined,
          winnings: result.winnings ?? 0,
          points: result.points ?? undefined,
          isQualification: result.isQualification ?? undefined,
        });
      }
    });
  }
  
  if (data.entries?.length) {
    data.entries.forEach(entry => {
      const key = entry.name?.toLowerCase();
      if (key && !playerMap.has(key)) {
        playerMap.set(key, { name: entry.name! });
      }
    });
  }
  
  if (data.seating?.length) {
    data.seating.forEach(seat => {
      const key = seat.name?.toLowerCase();
      if (key && !playerMap.has(key)) {
        playerMap.set(key, { name: seat.name! });
      }
    });
  }
  
  const allPlayers: EnrichPlayerInput[] = Array.from(playerMap.values());
  const hasCompleteResults = !!(data.results?.length && 
                               data.results.some(r => r.winnings && r.winnings > 0));
  
  return {
    allPlayers,
    totalUniquePlayers: allPlayers.length,
    totalInitialEntries: data.totalInitialEntries ?? allPlayers.length,
    totalEntries: data.totalEntries ?? allPlayers.length,
    hasCompleteResults,
  };
};

/**
 * Map game variant string to enum
 */
const mapGameVariant = (value: unknown): GameVariant | undefined => {
  if (!value) return undefined;
  
  const map: Record<string, GameVariant> = {
    'NLH': 'NLHE' as GameVariant,
    'NLHE': 'NLHE' as GameVariant,
    'PLO': 'PLO' as GameVariant,
    'PLOM': 'PLOM' as GameVariant,
    'PLO5': 'PLO5' as GameVariant,
    'PLOM5': 'PLOM5' as GameVariant,
    'PLO6': 'PLO6' as GameVariant,
    'PLOM6': 'PLOM6' as GameVariant,
    'PLMIXED': 'PLMIXED' as GameVariant,
    'PLDC': 'PLDC' as GameVariant,
    'NLDC': 'NLDC' as GameVariant,
    'NOT_PUBLISHED': 'NOT_PUBLISHED' as GameVariant,
  };
  
  return map[value as string] || (value as GameVariant);
};

// ===================================================================
// RESULT HELPERS
// ===================================================================

export const isEnrichmentSuccessful = (result: EnrichGameDataOutput): boolean => {
  return result.success && result.validation.isValid;
};

export const isSaveSuccessful = (result: EnrichGameDataOutput): boolean => {
  return result.success && 
         result.saveResult?.success === true && 
         !!result.saveResult?.gameId;
};

export const getEnrichmentErrorMessage = (result: EnrichGameDataOutput): string | null => {
  if (result.success && result.validation.isValid) {
    return null;
  }
  
  if (result.validation.errors.length > 0) {
    return result.validation.errors.map(e => e.message).join('; ');
  }
  
  if (result.saveResult && !result.saveResult.success) {
    return result.saveResult.message || 'Save failed';
  }
  
  return 'Enrichment failed';
};

export const getEnrichmentWarnings = (result: EnrichGameDataOutput): string[] => {
  const warnings: string[] = [];
  
  result.validation.warnings.forEach(w => warnings.push(w.message));
  
  if (result.saveResult?.warnings) {
    warnings.push(...result.saveResult.warnings);
  }
  
  return warnings;
};

// ===================================================================
// BACKWARD COMPATIBILITY
// ===================================================================

/**
 * @deprecated Use enrichAndSaveGame() instead
 */
export const saveGameDataToBackend_COMPAT = async (
  sourceUrl: string,
  venueId: string | null,
  data: ScrapedGameData,
  existingGameId?: string | null,
  entityId?: string,
  options?: {
    wasEdited?: boolean;
    originalData?: unknown;
  }
): Promise<EnrichmentSaveResult> => {
  console.warn(
    '[EnrichmentService] saveGameDataToBackend_COMPAT is deprecated. ' +
    'Please migrate to enrichAndSaveGame().'
  );
  
  if (!entityId) {
    throw new Error('entityId is required');
  }
  
  const input = scrapedDataToEnrichInput(
    data,
    entityId,
    sourceUrl,
    {
      venueId,
      existingGameId,
      wasEdited: options?.wasEdited,
    }
  );
  
  input.options = { ...input.options, saveToDatabase: true };
  
  const result = await enrichGameData(input);
  
  if (!result.success || !result.saveResult) {
    throw new Error(getEnrichmentErrorMessage(result) || 'Save failed');
  }
  
  return result.saveResult;
};

// ===================================================================
// PIPELINE INTEGRATION
// ===================================================================

/**
 * Enrich scraped game data for the scraper pipeline.
 * Called from useScrapeOrchestrator AFTER parsing HTML, BEFORE save decision.
 */
export async function enrichForPipeline(
  scrapedData: ScrapedGameData,
  entityId: string,
  venueId: string | null,
  sourceUrl: string
): Promise<PipelineEnrichmentResult> {
  const startTime = Date.now();
  const tournamentId = scrapedData.tournamentId;
  
  console.log('[EnrichmentService] Pipeline enrichment starting:', {
    tournamentId,
    entityId,
    venueId,
    name: scrapedData.name
  });
  
  try {
    const input = scrapedDataToEnrichInput(
      scrapedData,
      entityId,
      sourceUrl,
      {
        venueId,
        existingGameId: (scrapedData as Record<string, unknown>).existingGameId as string | null,
        wasEdited: false,
      }
    );
    
    // Preview mode - don't save yet
    input.options = {
      ...input.options,
      saveToDatabase: false,
      autoCreateSeries: false,
      autoCreateRecurring: false,
    };
    
    const result = await enrichGameData(input);
    const elapsed = Date.now() - startTime;
    
    if (!result.success) {
      console.warn('[EnrichmentService] Pipeline enrichment failed:', {
        tournamentId,
        errors: result.validation?.errors,
        elapsedMs: elapsed
      });
      
      return createPipelineFailureResult(scrapedData, entityId, venueId, sourceUrl, elapsed, result);
    }
    
    // Parse enrichedGame if it's a JSON string
    let enrichedGame: EnrichedGameData;
    if (typeof result.enrichedGame === 'string') {
      enrichedGame = JSON.parse(result.enrichedGame) as EnrichedGameData;
    } else if (result.enrichedGame) {
      enrichedGame = result.enrichedGame;
    } else {
      return createPipelineFailureResult(scrapedData, entityId, venueId, sourceUrl, elapsed, result);
    }
    
    // Create extended type with context fields preserved
    const enrichedWithContext: EnrichedGameDataWithContext = {
      ...enrichedGame,
      sourceUrl,
      entityId,
      venueMatch: scrapedData.venueMatch,
      s3Key: scrapedData.s3Key,
      doNotScrape: (scrapedData as Record<string, unknown>).doNotScrape as boolean,
      entries: scrapedData.entries,
      results: scrapedData.results,
      seating: scrapedData.seating,
    };
    
    // Ensure venueId is set
    if (!enrichedWithContext.venueId && venueId) {
      enrichedWithContext.venueId = venueId;
    }
    
    const metadata = result.enrichmentMetadata;
    
    console.log('[EnrichmentService] Pipeline enrichment success:', {
      tournamentId,
      recurringGameId: enrichedWithContext.recurringGameId,
      recurringStatus: metadata?.recurringResolution?.status,
      seriesId: enrichedWithContext.tournamentSeriesId,
      seriesStatus: metadata?.seriesResolution?.status,
      processingTimeMs: metadata?.processingTimeMs || elapsed
    });
    
    return {
      success: true,
      enrichedGame: enrichedWithContext,
      metadata: {
        recurringResolution: {
          status: metadata?.recurringResolution?.status || 'SKIPPED',
          confidence: metadata?.recurringResolution?.confidence ?? 0,
          matchedRecurringGameId: metadata?.recurringResolution?.matchedRecurringGameId,
          matchedRecurringGameName: metadata?.recurringResolution?.matchedRecurringGameName,
        },
        seriesResolution: {
          status: metadata?.seriesResolution?.status || 'SKIPPED',
          confidence: metadata?.seriesResolution?.confidence ?? 0,
          matchedSeriesId: metadata?.seriesResolution?.matchedSeriesId,
          matchedSeriesName: metadata?.seriesResolution?.matchedSeriesName,
        },
        processingTimeMs: metadata?.processingTimeMs || elapsed
      },
      validation: {
        isValid: result.validation?.isValid ?? true,
        errors: result.validation?.errors || [],
        warnings: result.validation?.warnings || []
      }
    };
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown enrichment error';
    
    console.error('[EnrichmentService] Pipeline enrichment error:', {
      tournamentId,
      elapsedMs: elapsed,
      error: errorMessage
    });
    
    return createPipelineFailureResult(scrapedData, entityId, venueId, sourceUrl, elapsed);
  }
}

/**
 * Create a failure result with original data preserved
 */
function createPipelineFailureResult(
  scrapedData: ScrapedGameData,
  entityId: string,
  venueId: string | null,
  sourceUrl: string,
  elapsedMs: number,
  partialResult?: EnrichGameDataOutput
): PipelineEnrichmentResult {
  // Create EnrichedGameDataWithContext from ScrapedGameData
  const enrichedGame: EnrichedGameDataWithContext = {
    // Required fields
    name: scrapedData.name || `Tournament ${scrapedData.tournamentId}`,
    gameType: (scrapedData.gameType as GameType) || 'TOURNAMENT',
    gameStatus: (scrapedData.gameStatus as GameStatus) || 'SCHEDULED',
    gameStartDateTime: scrapedData.gameStartDateTime || new Date().toISOString(),
    
    // Optional fields
    tournamentId: scrapedData.tournamentId,
    gameVariant: scrapedData.gameVariant as GameVariant,
    registrationStatus: scrapedData.registrationStatus as RegistrationStatus,
    gameEndDateTime: scrapedData.gameEndDateTime ?? undefined,
    buyIn: scrapedData.buyIn ?? undefined,
    rake: scrapedData.rake ?? undefined,
    startingStack: scrapedData.startingStack ?? undefined,
    hasGuarantee: scrapedData.hasGuarantee,  // Allow null
    guaranteeAmount: scrapedData.guaranteeAmount ?? undefined,
    totalUniquePlayers: scrapedData.totalUniquePlayers ?? undefined,
    totalInitialEntries: scrapedData.totalInitialEntries ?? undefined,
    totalEntries: scrapedData.totalEntries ?? undefined,
    totalRebuys: scrapedData.totalRebuys ?? undefined,
    totalAddons: scrapedData.totalAddons ?? undefined,
    prizepoolPaid: scrapedData.prizepoolPaid ?? undefined,
    prizepoolCalculated: scrapedData.prizepoolCalculated ?? undefined,
    isSeries: (scrapedData as Record<string, unknown>).isSeries as boolean,
    seriesName: ((scrapedData as Record<string, unknown>).seriesName as string) ?? undefined,
    isSatellite: (scrapedData as Record<string, unknown>).isSatellite as boolean,
    isRegular: (scrapedData as Record<string, unknown>).isRegular as boolean,
    gameTags: scrapedData.gameTags?.filter(Boolean) as string[],
    levels: scrapedData.levels,
    
    // Context fields - these allow null
    sourceUrl,
    entityId,
    venueId: venueId ?? undefined,
    venueMatch: scrapedData.venueMatch,
    s3Key: scrapedData.s3Key,  // Allow null
    doNotScrape: (scrapedData as Record<string, unknown>).doNotScrape as boolean,
    entries: scrapedData.entries,  // Allow null
    results: scrapedData.results,  // Allow null
    seating: scrapedData.seating,  // Allow null
  };
  
  return {
    success: false,
    enrichedGame,
    metadata: {
      recurringResolution: { status: 'SKIPPED', confidence: 0 },
      seriesResolution: { status: 'SKIPPED', confidence: 0 },
      processingTimeMs: elapsedMs
    },
    validation: {
      isValid: partialResult?.validation?.isValid ?? false,
      errors: partialResult?.validation?.errors || [
        { field: 'enrichment', message: 'Enrichment failed or was skipped' }
      ],
      warnings: partialResult?.validation?.warnings || []
    }
  };
}

/**
 * Enrich and save in one call - for use when skipping manual review entirely
 */
export async function enrichAndSaveForPipeline(
  scrapedData: ScrapedGameData,
  entityId: string,
  venueId: string,
  sourceUrl: string
): Promise<EnrichmentSaveResult> {
  const input = scrapedDataToEnrichInput(
    scrapedData,
    entityId,
    sourceUrl,
    { venueId }
  );
  
  input.options = {
    ...input.options,
    saveToDatabase: true,
    autoCreateSeries: true,
    autoCreateRecurring: true,
  };
  
  const result = await enrichGameData(input);
  
  if (!result.success || !result.saveResult) {
    throw new Error(getEnrichmentErrorMessage(result) || 'Enrich and save failed');
  }
  
  return result.saveResult;
}

// Re-export types for consumers
export type { 
  EnrichedGameData, 
  EnrichGameDataInput, 
  EnrichGameDataOutput,
  EnrichedGameDataWithContext,
  PipelineEnrichmentResult,
};

// ===================================================================
// DROP-IN REPLACEMENT FOR gameService.saveGameDataToBackend
// ===================================================================

/**
 * Save game data to backend via enrichment pipeline.
 * 
 * This is a drop-in replacement for the old gameService.saveGameDataToBackend().
 * It uses enrichGameData with saveToDatabase: true.
 * 
 * @param sourceUrl - Source URL for tracking
 * @param venueId - Venue ID (optional)
 * @param data - Scraped game data
 * @param existingGameId - Existing game ID for updates (optional)
 * @param entityId - Entity ID (required)
 * @param options - Additional options
 * @returns Save result with gameId
 */
export const saveGameDataToBackend = async (
  sourceUrl: string,
  venueId: string | null,
  data: ScrapedGameData,
  existingGameId?: string | null,
  entityId?: string,
  options?: {
    wasEdited?: boolean;
    autoCreateSeries?: boolean;
    autoCreateRecurring?: boolean;
  }
): Promise<EnrichmentSaveResult> => {
  if (!entityId) {
    throw new Error(
      '[enrichmentService.saveGameDataToBackend] entityId is required. ' +
      'Please pass the entity ID for multi-tenant support.'
    );
  }
  
  console.log('[EnrichmentService] saveGameDataToBackend:', {
    sourceUrl,
    venueId,
    entityId,
    existingGameId,
    name: data.name,
    tournamentId: data.tournamentId,
  });
  
  const input = scrapedDataToEnrichInput(
    data,
    entityId,
    sourceUrl,
    {
      venueId,
      existingGameId,
      wasEdited: options?.wasEdited,
    }
  );
  
  input.options = { 
    ...input.options, 
    saveToDatabase: true,
    autoCreateSeries: options?.autoCreateSeries ?? true,
    autoCreateRecurring: options?.autoCreateRecurring ?? true,
  };
  
  const result = await enrichGameData(input);
  
  if (!result.success) {
    const errorMsg = getEnrichmentErrorMessage(result) || 'Enrichment failed';
    console.error('[EnrichmentService] saveGameDataToBackend failed:', {
      errors: result.validation?.errors,
      message: errorMsg,
    });
    throw new Error(errorMsg);
  }
  
  if (!result.saveResult) {
    throw new Error('No save result returned from enrichGameData');
  }
  
  console.log('[EnrichmentService] saveGameDataToBackend success:', {
    gameId: result.saveResult.gameId,
    action: result.saveResult.action,
  });
  
  return result.saveResult;
};