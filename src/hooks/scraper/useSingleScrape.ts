// src/hooks/scraper/useSingleScrape.ts
// Hook for processing a single tournament ID with full interactive control
// This replaces useScrapeOrchestrator for single-ID mode only
//
// For batch processing, use useScraperJobs.startJob() from useScraperManagement.ts
//
// FIX: scrape() now returns { parsedData, enrichedData } to avoid stale state issues
// when reading enrichedData immediately after scrape completes.

import { useState, useCallback } from 'react';
import { ScrapedGameData } from '../../API';
import { 
  ProcessingResult, 
  ProcessingStatus,
  ScrapeOptions,
  DataSourceType,
} from '../../types/scraper';
import { fetchGameDataFromBackend } from '../../services/gameService';
import { 
  enrichForPipeline,
  saveGameDataToBackend,  // Use enrichment pipeline version
  type EnrichedGameDataWithContext,
} from '../../services/enrichmentService';
import { normalizeGameStatus } from '../../utils/statusNormalization';
import { scraperLogger } from '../../utils/scraperLogger';
import { classifyError } from '../../utils/scraperErrorUtils';

// ===================================================================
// TYPES
// ===================================================================

export interface UseSingleScrapeConfig {
  entityId: string;
  baseUrl: string;
  urlPath: string;
  scraperApiKey: string;
  options: ScrapeOptions;
  defaultVenueId: string;
}

/**
 * Result returned from scrape() function
 * Contains both parsed data and enriched data to avoid stale state issues
 */
export interface ScrapeResult {
  parsedData: ScrapedGameData | null;
  enrichedData: EnrichedGameDataWithContext | null;
}

export interface UseSingleScrapeResult {
  // State
  result: ProcessingResult | null;
  isProcessing: boolean;
  
  // Actions
  // UPDATED: scrape now returns { parsedData, enrichedData } directly
  scrape: (tournamentId: number) => Promise<ScrapeResult>;
  save: (venueId: string, editedData?: ScrapedGameData, overrideUrl?: string, overrideTournamentId?: number) => Promise<{ success: boolean; gameId?: string }>;
  reset: () => void;
  
  // Enriched data (available after scrape - kept for backwards compatibility)
  // NOTE: Prefer using the enrichedData returned directly from scrape() to avoid stale state
  enrichedData: EnrichedGameDataWithContext | null;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getDataSource = (parsedData: ScrapedGameData): DataSourceType => {
  const dataAsRecord = parsedData as Record<string, unknown>;
  const source = dataAsRecord.source as string | undefined;
  
  if (source === 'S3_CACHE' || source === 'HTTP_304_CACHE') return 's3';
  if (source === 'LIVE') return 'web';
  if (parsedData.s3Key) return 's3';
  return 'web';
};

const isNotFoundGameStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === 'NOT_FOUND' || normalized === 'NOT_IN_USE' || normalized === 'BLANK';
};

// ===================================================================
// HOOK
// ===================================================================

export const useSingleScrape = (config: UseSingleScrapeConfig): UseSingleScrapeResult => {
  const {
    entityId,
    baseUrl,
    urlPath,
    scraperApiKey,
    options,
    defaultVenueId,
  } = config;

  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedGameDataWithContext | null>(null);

  // =========================================================================
  // SCRAPE - Fetch and optionally enrich data
  // UPDATED: Now returns { parsedData, enrichedData } to avoid stale state
  // =========================================================================
  
  const scrape = useCallback(async (tournamentId: number): Promise<ScrapeResult> => {
    const url = `${baseUrl}${urlPath}${tournamentId}`;
    
    // Clear previous state immediately
    setIsProcessing(true);
    setEnrichedData(null);
    setResult({
      id: tournamentId,
      url,
      status: 'scraping',
      message: 'Fetching tournament data...',
    });

    scraperLogger.logItemStart(tournamentId, url);

    // Track enriched data locally to return directly (avoids stale state)
    let localEnrichedData: EnrichedGameDataWithContext | null = null;

    try {
      // Fetch from backend
      const parsedData = await fetchGameDataFromBackend(
        url, 
        !options.useS3, // forceRefresh
        scraperApiKey, 
        entityId
      );

      if (!parsedData) {
        setResult({
          id: tournamentId,
          url,
          status: 'error',
          message: 'No data returned from scraper',
          errorType: 'UNKNOWN',
        });
        setIsProcessing(false);
        return { parsedData: null, enrichedData: null };
      }

      // Check for error in response
      const dataAsRecord = parsedData as Record<string, unknown>;
      const errorMsg = (dataAsRecord.error || dataAsRecord.errorMessage) as string | undefined;
      
      if (errorMsg || parsedData.name === 'Error processing tournament') {
        const errorType = classifyError(errorMsg || 'Unknown error', parsedData);
        setResult({
          id: tournamentId,
          url,
          status: 'error',
          message: errorMsg || 'Scraper Error',
          errorType,
          parsedData,
        });
        scraperLogger.logFetchError(tournamentId, errorMsg || 'Scraper Error', errorType);
        setIsProcessing(false);
        return { parsedData, enrichedData: null }; // Return so caller can inspect
      }

      const normalizedStatus = normalizeGameStatus(parsedData.gameStatus);
      const dataSource = getDataSource(parsedData);
      
      scraperLogger.logFetchSuccess(tournamentId, dataSource === 's3' ? 'S3_CACHE' : 'LIVE', parsedData.name || undefined);

      // Check for special statuses (NOT_FOUND, etc.)
      if (isNotFoundGameStatus(normalizedStatus)) {
        setResult({
          id: tournamentId,
          url,
          status: 'skipped',
          message: normalizedStatus || 'NOT_FOUND',
          parsedData,
          dataSource,
        });
        setIsProcessing(false);
        return { parsedData, enrichedData: null };
      }

      // Check for doNotScrape
      const isDoNotScrape = dataAsRecord.skipped && dataAsRecord.skipReason === 'DO_NOT_SCRAPE';
      if (isDoNotScrape && !options.ignoreDoNotScrape) {
        setResult({
          id: tournamentId,
          url,
          status: 'skipped',
          message: 'Do Not Scrape',
          parsedData,
          dataSource,
        });
        setIsProcessing(false);
        return { parsedData, enrichedData: null };
      }

      // Enrich the data for modal display
      const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
      
      try {
        const enrichResult = await enrichForPipeline(
          parsedData,
          entityId,
          autoVenueId || defaultVenueId || null,
          url
        );
        
        // Store locally AND in state
        localEnrichedData = enrichResult.enrichedGame;
        setEnrichedData(localEnrichedData);
      } catch (enrichError) {
        console.warn('[useSingleScrape] Enrichment failed, using raw data:', enrichError);
        // Continue without enrichment - localEnrichedData remains null
      }
      
      setResult({
        id: tournamentId,
        url,
        status: 'review',
        message: 'Ready for review',
        parsedData,
        autoVenueId: autoVenueId || undefined,
        dataSource,
      });

      setIsProcessing(false);
      
      // Return both parsed and enriched data directly to avoid stale state issues
      return { parsedData, enrichedData: localEnrichedData };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Unknown error occurred';
      const errorType = classifyError(errorMessage);
      
      setResult({
        id: tournamentId,
        url,
        status: 'error',
        message: errorMessage,
        errorType,
      });
      
      scraperLogger.error('PROCESSING_ERROR', errorMessage, { tournamentId });
      setIsProcessing(false);
      return { parsedData: null, enrichedData: null };
    }
  }, [entityId, baseUrl, urlPath, scraperApiKey, options, defaultVenueId]);

  // =========================================================================
  // SAVE - Save the scraped data to database
  // =========================================================================
  
  const save = useCallback(async (
    venueId: string, 
    editedData?: ScrapedGameData,
    overrideUrl?: string,
    overrideTournamentId?: number
  ): Promise<{ success: boolean; gameId?: string }> => {
    // Use overrides if provided (to avoid stale closure issues), otherwise fall back to result state
    const urlToUse = overrideUrl || result?.url;
    const idToUse = overrideTournamentId ?? result?.id;
    
    if (!urlToUse || idToUse === undefined) {
      console.warn('[useSingleScrape] save() called but missing url or id', { 
        hasOverrideUrl: !!overrideUrl, 
        hasResultUrl: !!result?.url,
        overrideTournamentId,
        resultId: result?.id 
      });
      return { success: false };
    }

    const dataToSave = editedData || result?.parsedData;
    if (!dataToSave) {
      console.warn('[useSingleScrape] save() called but no data to save (no editedData and no result.parsedData)');
      return { success: false };
    }
    
    setResult(prev => prev ? {
      ...prev,
      status: 'saving' as ProcessingStatus,
      message: 'Saving to database...',
      selectedVenueId: venueId,
    } : null);
    
    setIsProcessing(true);
    scraperLogger.info('ITEM_SAVING', 'Saving tournament', { tournamentId: idToUse });

    try {
      const saveResult = await saveGameDataToBackend(
        urlToUse,
        venueId,
        dataToSave,
        null, // existingGameId - let backend determine
        entityId
      );

      const gameId = saveResult.gameId || undefined;
      const action = saveResult.action || 'CREATED';

      setResult(prev => prev ? {
        ...prev,
        status: 'success' as ProcessingStatus,
        message: `${action === 'UPDATED' ? 'Updated' : 'Created'} game ${gameId}`,
        savedGameId: gameId,
        selectedVenueId: venueId,
      } : null);

      scraperLogger.logSaveSuccess(idToUse, gameId || 'unknown', action === 'UPDATED' ? 'UPDATE' : 'CREATE');
      setIsProcessing(false);
      
      return { success: true, gameId };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Save failed';
      
      setResult(prev => prev ? {
        ...prev,
        status: 'error' as ProcessingStatus,
        message: `Save failed: ${errorMessage}`,
        errorType: 'SAVE',
      } : null);

      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId: idToUse });
      setIsProcessing(false);
      
      return { success: false };
    }
  }, [result, entityId]);

  // =========================================================================
  // RESET - Clear state for new processing
  // =========================================================================
  
  const reset = useCallback(() => {
    setResult(null);
    setEnrichedData(null);
    setIsProcessing(false);
  }, []);

  return {
    result,
    isProcessing,
    scrape,
    save,
    reset,
    enrichedData,
  };
};

export default useSingleScrape;