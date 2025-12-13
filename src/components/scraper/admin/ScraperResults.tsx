// src/components/scraper/admin/ScraperResults.tsx
// Results list display with simplified view for Bulk/Range modes
// FIXED: Data source detection now correctly identifies LIVE vs S3_CACHE

import React, { useMemo } from 'react';
import { ProcessingResult, IdSelectionMode } from '../../../types/scraper';
import { GameListItem } from '../GameListItem';
import { Venue } from '../../../API';
import type { GameState, JobStatus } from '../../../types/game';
import { ScrapedGameData } from '../../../API';

// Import shared getDataSource utility
import { getDataSource } from '../../../utils/processingResultUtils';

interface ScraperResultsProps {
  results: ProcessingResult[];
  mode: IdSelectionMode;
  venues: Venue[];
  onVenueChange: (resultId: number, venueId: string) => void;
  onManualSave: (result: ProcessingResult) => void;
  onViewDetails: (data: ScrapedGameData) => void;
  simplifiedView?: boolean;
  maxDisplayCount?: number;
}

// ===================================================================
// DATA SOURCE DETECTION
// ===================================================================

// getDataSource imported from ../../../utils/processingResultUtils

// ===================================================================
// RESULT TO GAME STATE CONVERSION
// ===================================================================

/**
 * Convert ProcessingResult to GameState for GameListItem
 */
const resultToGameState = (result: ProcessingResult): GameState => {
  const gameData = result.parsedData || {
    name: `Tournament ${result.id}`,
    tournamentId: result.id,
    sourceUrl: result.url,
  };

  const isSuccessfulSave = 
    (result.status === 'success' || result.status === 'warning') && 
    (result.savedGameId || 
     result.parsedData?.existingGameId ||
     result.message.includes('Saved') ||
     result.message.includes('Created') ||
     result.message.includes('Updated'));

  return {
    id: result.url,
    source: 'SCRAPER' as any,
    data: gameData as any,
    jobStatus: mapProcessingStatusToJobStatus(result.status),
    errorMessage: result.status === 'error' ? result.message : undefined,
    existingGameId: result.savedGameId || result.parsedData?.existingGameId,
    saveResult: isSuccessfulSave 
      ? { id: result.savedGameId || result.parsedData?.existingGameId || 'saved' } 
      : undefined,
    fetchCount: 1,
  };
};

/**
 * Map processing status to job status for GameListItem
 */
const mapProcessingStatusToJobStatus = (status: ProcessingResult['status']): JobStatus => {
  switch (status) {
    case 'scraping': return 'SCRAPING';
    case 'saving': return 'SAVING';
    case 'success': return 'DONE';
    case 'warning': return 'DONE';
    case 'error': return 'ERROR';
    default: return 'IDLE';
  }
};

// ===================================================================
// STATS CALCULATION
// ===================================================================

interface ResultStats {
  pending: number;
  completed: number;
  warnings: number;
  errors: number;
  skipped: number;
  total: number;
}

const calculateStats = (results: ProcessingResult[]): ResultStats => {
  return {
    pending: results.filter(r => r.status === 'pending').length,
    completed: results.filter(r => ['success', 'warning', 'error', 'skipped'].includes(r.status)).length,
    warnings: results.filter(r => r.status === 'warning').length,
    errors: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    total: results.length,
  };
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScraperResults: React.FC<ScraperResultsProps> = ({
  results,
  mode,
  venues,
  onVenueChange,
  onManualSave,
  onViewDetails,
  simplifiedView = false,
  maxDisplayCount = 20
}) => {
  // Determine if we should use simplified view
  const useSimplifiedDisplay = simplifiedView || mode === 'bulk' || mode === 'range';
  
  // Filter and sort results for display
  const displayResults = useMemo(() => {
    if (!useSimplifiedDisplay) {
      // Full view - show all results, newest first
      return [...results].reverse();
    }
    
    // Simplified view - show only processed items + currently processing
    const processedOrActive = results.filter(r => 
      ['success', 'warning', 'error', 'skipped', 'scraping', 'saving', 'review'].includes(r.status)
    );
    
    // Take the most recent items, newest first
    return [...processedOrActive].reverse().slice(0, maxDisplayCount);
  }, [results, useSimplifiedDisplay, maxDisplayCount]);

  // Calculate stats
  const stats = useMemo(() => calculateStats(results), [results]);

  // Don't render if no results
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header with stats */}
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Processing Results</h3>
        <div className="text-xs text-gray-500 flex gap-3">
          {useSimplifiedDisplay && stats.pending > 0 && (
            <span className="bg-gray-100 px-2 py-1 rounded">
              {stats.pending} queued
            </span>
          )}
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
            {stats.completed} / {stats.total} processed
          </span>
          {stats.warnings > 0 && (
            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
              ⚠️ {stats.warnings} warning{stats.warnings !== 1 ? 's' : ''}
            </span>
          )}
          {stats.errors > 0 && (
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded">
              ✗ {stats.errors} error{stats.errors !== 1 ? 's' : ''}
            </span>
          )}
          {useSimplifiedDisplay && (
            <span className="text-gray-400 italic">
              (showing last {Math.min(displayResults.length, maxDisplayCount)})
            </span>
          )}
        </div>
      </div>
      
      {/* Results list */}
      <div className="p-4 max-h-[500px] overflow-y-auto space-y-2">
        {displayResults.map((result) => (
          <GameListItem
            key={result.id}
            game={resultToGameState(result)}
            venues={venues}
            selectedVenueId={result.selectedVenueId}
            onVenueChange={(venueId) => onVenueChange(result.id, venueId)}
            onSave={() => onManualSave(result)}
            onViewDetails={result.parsedData ? () => onViewDetails(result.parsedData!) : undefined}
            showVenueSelector={true}
            showActions={true}
            compact={true}
            processingStatus={result.status}
            processingMessage={result.message}
            tournamentId={result.id}
            sourceUrl={result.url}
            dataSource={getDataSource(result)}
          />
        ))}
        
        {/* Indicator for hidden results */}
        {useSimplifiedDisplay && displayResults.length < stats.completed && (
          <div className="text-center py-2 text-xs text-gray-400 border-t mt-2">
            + {stats.completed - displayResults.length} older results not shown
          </div>
        )}
      </div>
    </div>
  );
};

export default ScraperResults;
