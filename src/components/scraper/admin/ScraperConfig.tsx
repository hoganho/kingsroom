// src/components/scraper/admin/ScraperConfig.tsx
// Configuration panel for the scraper including ID selection, options, venue, and API key

import React from 'react';
import { Play, Key, AlertTriangle } from 'lucide-react';
import { 
  IdSelectionMode, 
  IdSelectionParams, 
  ScrapeFlow, 
  ScrapeOptions,
  AutoProcessingConfig 
} from '../../../types/scraper';
import { Venue } from '../../../API';
import { EntityScrapingStatus, TournamentIdBounds } from '../../../hooks/useGameIdTracking';

interface ScraperConfigProps {
  // ID Selection
  idSelectionMode: IdSelectionMode;
  setIdSelectionMode: (mode: IdSelectionMode) => void;
  idSelectionParams: IdSelectionParams;
  setIdSelectionParams: React.Dispatch<React.SetStateAction<IdSelectionParams>>;
  
  // Scrape Flow
  scrapeFlow: ScrapeFlow;
  setScrapeFlow: (flow: ScrapeFlow) => void;
  
  // Options
  options: ScrapeOptions;
  setOptions: React.Dispatch<React.SetStateAction<ScrapeOptions>>;
  
  // Venues
  venues: Venue[];
  defaultVenueId: string;
  setDefaultVenueId: (id: string) => void;
  entityDefaultVenueId: string;
  onSaveDefaultVenue: (venueId: string) => void;
  isSavingDefaultVenue: boolean;
  
  // API Key
  scraperApiKey: string;
  setScraperApiKey: (key: string) => void;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  apiKeyError: string | null;
  setApiKeyError: (error: string | null) => void;
  
  // Processing State
  isProcessing: boolean;
  gapLoading: boolean;
  onStartProcessing: () => void;
  
  // Scraping Status
  scrapingStatus: EntityScrapingStatus | null;
  bounds: TournamentIdBounds | null;
  autoConfig: AutoProcessingConfig;
}

export const ScraperConfig: React.FC<ScraperConfigProps> = ({
  idSelectionMode,
  setIdSelectionMode,
  idSelectionParams,
  setIdSelectionParams,
  scrapeFlow,
  setScrapeFlow,
  options,
  setOptions,
  venues,
  defaultVenueId,
  setDefaultVenueId,
  entityDefaultVenueId,
  onSaveDefaultVenue,
  isSavingDefaultVenue,
  scraperApiKey,
  setScraperApiKey,
  showApiKey,
  setShowApiKey,
  apiKeyError,
  setApiKeyError,
  isProcessing,
  gapLoading,
  onStartProcessing,
  scrapingStatus,
  bounds,
  autoConfig
}) => {
  const highestTournamentId = scrapingStatus?.highestTournamentId ?? bounds?.highestId;

  // Render mode-specific inputs
  const renderIdSelectionInputs = () => {
    switch (idSelectionMode) {
      case 'bulk':
        return (
          <input
            type="number"
            value={idSelectionParams.bulkCount}
            onChange={(e) => setIdSelectionParams(p => ({ ...p, bulkCount: e.target.value }))}
            disabled={isProcessing}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Count (e.g., 10)"
            min="1"
            max="500"
          />
        );
      case 'range':
        return (
          <input
            type="text"
            value={idSelectionParams.rangeString}
            onChange={(e) => setIdSelectionParams(p => ({ ...p, rangeString: e.target.value }))}
            disabled={isProcessing}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            placeholder="e.g., 100-110, 115, 120-125"
          />
        );
      case 'gaps':
        return (
          <div className="text-sm text-gray-600 mt-1 p-2 bg-gray-50 rounded">
            {scrapingStatus ? (
              <>
                <p><strong>{scrapingStatus.gapSummary.totalGaps}</strong> gaps with <strong>{scrapingStatus.gapSummary.totalMissingIds}</strong> missing IDs</p>
                <p className="text-xs">Coverage: {scrapingStatus.gapSummary.coveragePercentage}%</p>
              </>
            ) : 'Loading gap data...'}
          </div>
        );
      case 'auto':
        // NEW: Show Start ID and Max ID inputs for auto mode
        return (
          <div className="space-y-3 mt-1">
            <div className="p-2 bg-amber-50 border border-amber-200 rounded">
              <p className="font-medium text-amber-800 text-sm">Auto Mode</p>
              <p className="text-xs text-amber-700">
                Will fill gaps first, then scan new IDs. Pauses on any error or after {autoConfig.maxConsecutiveNotFound} consecutive NOT_FOUND.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Start from ID</label>
                <input
                  type="number"
                  value={idSelectionParams.nextId || String((highestTournamentId || 0) + 1)}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, nextId: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder={String((highestTournamentId || 0) + 1)}
                  min="1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Default: {(highestTournamentId || 0) + 1}
                </p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-600">Max ID (Stop At)</label>
                <input
                  type="number"
                  value={idSelectionParams.maxId}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, maxId: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="No limit"
                  min="1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Optional stop condition
                </p>
              </div>
            </div>
          </div>
        );
      case 'next':
        return (
          <div className="text-sm text-gray-600 mt-1">
            <label className="text-xs font-medium text-gray-600">Next ID</label>
            <input
              type="number"
              value={idSelectionParams.nextId || ''}
              onChange={(e) => setIdSelectionParams(p => ({ ...p, nextId: e.target.value }))}
              disabled={isProcessing}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder={String((highestTournamentId || 0) + 1)}
              min="1"
            />
            <p className="text-xs text-gray-400 mt-1">
              Default: {(highestTournamentId || 0) + 1} (highest + 1)
            </p>
          </div>
        );
      default:
        return (
          <div className="text-sm text-gray-600 mt-1">
            Next ID: <strong>{idSelectionParams.nextId || ((highestTournamentId || 0) + 1)}</strong>
          </div>
        );
    }
  };

  // Render API Key configuration
  const renderApiKeyConfig = () => (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Key className="h-4 w-4" />
        ScraperAPI Key
      </label>
      
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={scraperApiKey}
            onChange={(e) => {
              setScraperApiKey(e.target.value);
              setApiKeyError(null); 
            }}
            disabled={isProcessing}
            autoComplete="off"
            className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:ring-2 focus:border-transparent disabled:bg-gray-100 ${
              apiKeyError 
                ? 'border-red-300 ring-red-200 bg-red-50 text-red-900 focus:ring-red-500' 
                : 'border-gray-300 focus:ring-blue-500'
            }`}
            placeholder="Enter ScraperAPI key"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowApiKey(!showApiKey)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          disabled={isProcessing}
        >
          {showApiKey ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {apiKeyError ? (
        <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle className="h-3 w-3" />
          {apiKeyError}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          This key is used to fetch tournament pages through ScraperAPI.
          {!scraperApiKey && <span className="text-amber-600 ml-1">⚠ No key configured - fetches may fail</span>}
        </p>
      )}
    </form>
  );

  // Options configuration
  const optionsConfig = [
    { key: 'useS3', label: 'Use S3 Cache', desc: 'Fetch from S3 first if available' },
    { key: 'skipManualReviews', label: 'Skip Manual Reviews', desc: 'Auto-save with defaults' },
    { key: 'ignoreDoNotScrape', label: 'Ignore Do Not Scrape', desc: 'Process marked tournaments' },
    { key: 'skipInProgress', label: 'Skip In-Progress', desc: 'Skip RUNNING/SCHEDULED' },
    { key: 'skipNotPublished', label: 'Skip NOT_PUBLISHED', desc: 'Skip previously scraped NOT_PUBLISHED games' },
    { key: 'skipNotFoundGaps', label: 'Skip NOT_FOUND Gaps', desc: 'Skip gaps with lastScrapeStatus=NOT_FOUND' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left Column - ID Selection and Flow */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">ID Selection Mode</label>
          <select
            value={idSelectionMode}
            onChange={e => setIdSelectionMode(e.target.value as IdSelectionMode)}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            disabled={isProcessing}
          >
            <option value="next">Next ID</option>
            <option value="bulk">Bulk</option>
            <option value="range">Range</option>
            <option value="gaps" disabled={!scrapingStatus || scrapingStatus.gapSummary.totalGaps === 0}>
              Fill Gaps ({scrapingStatus?.gapSummary.totalGaps || 0})
            </option>
            <option value="refresh" disabled={!scrapingStatus || scrapingStatus.unfinishedGameCount === 0}>
              Refresh Non-Finished ({scrapingStatus?.unfinishedGameCount || 0})
            </option>
            <option value="auto">Auto</option>
          </select>
        </div>
        
        <div>
          <label className="text-sm font-medium text-gray-700">Mode Parameters</label>
          {renderIdSelectionInputs()}
        </div>
        
        <div>
          <label className="text-sm font-medium text-gray-700">Scrape Flow</label>
          <div className="flex mt-1 rounded-md shadow-sm">
            <button
              type="button"
              onClick={() => setScrapeFlow('scrape')}
              disabled={isProcessing}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-md border ${
                scrapeFlow === 'scrape'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Scrape Only
            </button>
            <button
              type="button"
              onClick={() => setScrapeFlow('scrape_save')}
              disabled={isProcessing}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                scrapeFlow === 'scrape_save'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Scrape + Save
            </button>
          </div>
        </div>
      </div>

      {/* Right Column - Options, Venue, API Key */}
      <div className="space-y-4">
        {/* Options Checkboxes */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Options</label>
          {optionsConfig.map(opt => (
            <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options[opt.key as keyof ScrapeOptions]}
                onChange={e => setOptions(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                disabled={isProcessing}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">{opt.label}</span>
                <span className="text-gray-500 ml-1">- {opt.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Venue Selection */}
        <div>
          <label className="text-sm font-medium text-gray-700">Default Venue</label>
          <div className="flex gap-2 mt-1">
            <select
              value={defaultVenueId}
              onChange={e => setDefaultVenueId(e.target.value)}
              disabled={isProcessing}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select Venue...</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {defaultVenueId && defaultVenueId !== entityDefaultVenueId && (
              <button
                onClick={() => onSaveDefaultVenue(defaultVenueId)}
                disabled={isSavingDefaultVenue || isProcessing}
                className="px-3 py-2 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isSavingDefaultVenue ? '...' : 'Set Default'}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {entityDefaultVenueId 
              ? 'Games with low venue confidence (<0.6) will auto-assign to this venue.' 
              : 'Set a default venue to auto-assign games when venue matching fails.'}
          </p>
        </div>

        {/* API Key Config */}
        {renderApiKeyConfig()}
      </div>

      {/* Start Button - Full Width */}
      <div className="md:col-span-2 mt-2 pt-4 border-t">
        <button
          onClick={onStartProcessing}
          disabled={isProcessing || gapLoading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <Play className="h-5 w-5" />
          Start Processing
        </button>
      </div>
    </div>
  );
};

export default ScraperConfig;