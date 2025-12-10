// src/pages/scraper-admin-tabs/ScraperTab.tsx
// ENHANCED: Comprehensive error handling for auto-processing mode
// Version 2.0.0 - Added error classification, consecutive error tracking, and error decision modal

import React, { useState, useEffect, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  Play, StopCircle, Settings, Eye, ChevronDown, ChevronRight,
  RefreshCw, Pause, CheckCircle, Key, AlertTriangle, XCircle
} from 'lucide-react';

// --- Real Imports ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';
import { Venue } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';
import { VenueModal } from '../../components/venues/VenueModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import {
  fetchGameDataFromBackend,
  saveGameDataToBackend
} from '../../services/gameService';
import { ScrapedGameData } from '../../API';
import type { GameState, GameData } from '../../types/game';

// --- Types ---

interface ScrapeTabProps {
  urlToReparse?: string | null;
  onReparseComplete?: () => void;
}

type IdSelectionMode = 'next' | 'bulk' | 'range' | 'gaps' | 'refresh' | 'auto';
type ScrapeFlow = 'scrape' | 'scrape_save';
type ProcessingStatus = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'skipped' | 'error';

interface ScrapeOptions {
  useS3: boolean;
  skipManualReviews: boolean;
  ignoreDoNotScrape: boolean;
  skipInProgress: boolean;
  overrideExisting: boolean;
}

interface IdSelectionParams {
  bulkCount: string;
  rangeString: string;
}

// ===================================================================
// ERROR HANDLING TYPES
// ===================================================================

type ErrorType = 
  | 'AUTH'           // API key invalid, 401/403
  | 'NETWORK'        // Timeout, connection failed
  | 'RATE_LIMIT'     // Too many requests (429)
  | 'PARSE'          // Failed to parse response
  | 'VALIDATION'     // Data validation failed
  | 'SAVE'           // Failed to save to DB
  | 'NOT_FOUND'      // Tournament doesn't exist (blank/404)
  | 'UNKNOWN';       // Unclassified error

interface ErrorDecision {
  action: 'skip' | 'retry' | 'stop';
}

interface ErrorModalState {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  errorType: ErrorType;
  errorMessage: string;
  canRetry: boolean;
}

interface AutoProcessingConfig {
  maxConsecutiveErrors: number;      // Pause after N consecutive errors
  maxTotalErrors: number;            // Pause after N total errors in session
  pauseOnUnknownError: boolean;      // Always pause on unknown errors
  autoRetryTransientErrors: boolean; // Auto-retry network/rate limit once
  retryDelayMs: number;              // Delay before auto-retry
  maxConsecutiveBlanks: number;      // Stop after N consecutive blank/not-found
}

const DEFAULT_AUTO_CONFIG: AutoProcessingConfig = {
  maxConsecutiveErrors: 1,           // Pause after ANY error (user can decide)
  maxTotalErrors: 15,                // Informational - tracked but not used for pausing
  pauseOnUnknownError: true,         // Always pause on unknown errors
  autoRetryTransientErrors: true,    // Auto-retry network/rate limit once before pausing
  retryDelayMs: 2000,                // 2 second delay before retry
  maxConsecutiveBlanks: 2,           // Pause after 2 consecutive blanks (end of published?)
};

interface ProcessingResult {
  id: number;
  url: string;
  status: ProcessingStatus;
  message: string;
  parsedData?: ScrapedGameData;
  autoVenueId?: string;
  selectedVenueId?: string;
  savedGameId?: string;
  errorType?: ErrorType;  // Track error type for display
}

interface GameForReview {
  game: ScrapedGameData;
  venueId: string;
  entityId: string;
}

interface ModalResolverValue {
  action: 'save' | 'cancel';
  gameData?: ScrapedGameData | GameData;
  venueId?: string;
}

// ===================================================================
// ERROR CLASSIFICATION UTILITIES
// ===================================================================

/**
 * Classify an error into a type for handling decisions
 */
const classifyError = (error: any, parsedData?: any): ErrorType => {
  const message = (error?.message || error || '').toString().toLowerCase();
  
  // Auth errors - stop immediately
  if (message.includes('401') || 
      message.includes('403') ||
      message.includes('unauthorized') || 
      message.includes('forbidden') ||
      message.includes('scraperapi') ||
      message.includes('api key') ||
      message.includes('invalid key')) {
    return 'AUTH';
  }
  
  // Not found / blank - tournament doesn't exist
  if (message.includes('404') ||
      message.includes('not found') ||
      message.includes('blank') ||
      message.includes('no data') ||
      message.includes('empty response') ||
      (parsedData?.gameStatus === 'NOT_PUBLISHED' && !parsedData?.name)) {
    return 'NOT_FOUND';
  }
  
  // Network errors - transient, can retry
  if (message.includes('timeout') || 
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket') ||
      message.includes('econnreset') ||
      message.includes('fetch failed')) {
    return 'NETWORK';
  }
  
  // Rate limiting - transient, wait and retry
  if (message.includes('429') || 
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttl') ||
      message.includes('quota')) {
    return 'RATE_LIMIT';
  }
  
  // Parse errors
  if (message.includes('parse') || 
      message.includes('json') ||
      message.includes('unexpected token') ||
      message.includes('syntax error') ||
      (parsedData?.name === 'Error processing tournament')) {
    return 'PARSE';
  }
  
  // Validation errors
  if (message.includes('validation') || 
      message.includes('required field') ||
      message.includes('invalid') ||
      message.includes('constraint')) {
    return 'VALIDATION';
  }
  
  // Save/DB errors
  if (message.includes('dynamodb') || 
      message.includes('database') ||
      message.includes('save failed') ||
      message.includes('put item') ||
      message.includes('update item') ||
      message.includes('conditional check')) {
    return 'SAVE';
  }
  
  return 'UNKNOWN';
};

/**
 * Check if an error type is transient (worth auto-retrying)
 */
const isTransientError = (errorType: ErrorType): boolean => {
  return errorType === 'NETWORK' || errorType === 'RATE_LIMIT';
};

/**
 * Check if an error should immediately stop processing
 */
const shouldStopImmediately = (errorType: ErrorType): boolean => {
  return errorType === 'AUTH';
};

/**
 * Get user-friendly error description
 */
const getErrorDescription = (errorType: ErrorType, message: string): string => {
  switch (errorType) {
    case 'AUTH':
      return `Authentication failed: ${message}\n\nYour API key may be invalid, expired, or out of credits. Processing cannot continue.`;
    case 'NETWORK':
      return `Network error: ${message}\n\nThis may be a temporary connectivity issue. You can retry or skip this tournament.`;
    case 'RATE_LIMIT':
      return `Rate limited: ${message}\n\nToo many requests sent. Wait a moment before retrying.`;
    case 'NOT_FOUND':
      return `Tournament not found: ${message}\n\nThis tournament ID may not exist yet or the page is blank.`;
    case 'PARSE':
      return `Failed to parse data: ${message}\n\nThe tournament page has an unexpected format or structure.`;
    case 'VALIDATION':
      return `Data validation failed: ${message}\n\nThe scraped data doesn't meet the required format.`;
    case 'SAVE':
      return `Database error: ${message}\n\nFailed to save to the database. This may be a temporary issue.`;
    default:
      return `Unexpected error: ${message}\n\nThis error type wasn't recognized. You may want to investigate.`;
  }
};

/**
 * Get color scheme for error type
 */
const getErrorColorScheme = (errorType: ErrorType): { border: string; bg: string; text: string } => {
  switch (errorType) {
    case 'AUTH':
      return { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-700' };
    case 'RATE_LIMIT':
      return { border: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' };
    case 'NETWORK':
      return { border: 'border-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700' };
    case 'NOT_FOUND':
      return { border: 'border-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' };
    default:
      return { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700' };
  }
};

// Helper to get client lazily (after Amplify is configured)
const getClient = () => generateClient();

// ===================================================================
// HELPER: Sanitize Data for Placeholders
// ===================================================================

const sanitizeGameDataForPlaceholder = (data: ScrapedGameData): ScrapedGameData => {
  return {
    ...data,
    hasGuarantee: data.hasGuarantee ?? false,
    isSeries: data.isSeries ?? false,
    isSatellite: data.isSatellite ?? false,
    isRegular: data.isRegular ?? false,
    isMainEvent: data.isMainEvent ?? false,
    finalDay: data.finalDay ?? false,
    buyIn: data.buyIn ?? 0,
    rake: data.rake ?? 0,
    guaranteeAmount: data.guaranteeAmount ?? 0,
    totalUniquePlayers: 0,
    totalInitialEntries: 0,
    totalEntries: 0,
    totalRebuys: 0,
    totalAddons: 0,
    entries: [],
    results: [],
    seating: [],
    levels: [],
    name: data.name || `Tournament ${data.tournamentId} (Not Published)`,
    gameStatus: 'NOT_PUBLISHED' as any 
  };
};

// ===================================================================
// ERROR HANDLING MODAL COMPONENT
// ===================================================================

interface ErrorHandlingModalProps {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  errorType: ErrorType;
  errorMessage: string;
  canRetry: boolean;
  consecutiveErrors: number;
  totalErrors: number;
  consecutiveBlanks: number;
  remainingInQueue: number;
  onDecision: (decision: ErrorDecision) => void;
}

const ErrorHandlingModal: React.FC<ErrorHandlingModalProps> = ({
  isOpen,
  tournamentId,
  url,
  errorType,
  errorMessage,
  canRetry,
  consecutiveErrors,
  totalErrors,
  consecutiveBlanks,
  remainingInQueue,
  onDecision
}) => {
  if (!isOpen) return null;

  const colors = getErrorColorScheme(errorType);

  const getErrorIcon = () => {
    switch (errorType) {
      case 'AUTH': return <XCircle className="h-8 w-8 text-red-600" />;
      case 'NETWORK': return <AlertTriangle className="h-8 w-8 text-yellow-600" />;
      case 'RATE_LIMIT': return <Pause className="h-8 w-8 text-orange-600" />;
      case 'NOT_FOUND': return <Eye className="h-8 w-8 text-gray-500" />;
      default: return <AlertTriangle className="h-8 w-8 text-red-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 border-l-4 ${colors.border}`}>
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          {getErrorIcon()}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Processing Error - Tournament {tournamentId}
            </h3>
            <p className="text-sm text-gray-500 uppercase tracking-wide">
              {errorType.replace('_', ' ')} Error
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Error Details */}
          <div className={`rounded-lg p-3 ${colors.bg}`}>
            <p className={`text-sm whitespace-pre-wrap ${colors.text}`}>
              {getErrorDescription(errorType, errorMessage)}
            </p>
          </div>

          {/* URL */}
          <div className="text-xs text-gray-500 truncate font-mono bg-gray-100 p-2 rounded">
            {url}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500 block text-xs">Consecutive Errors</span>
              <span className={`font-semibold ${consecutiveErrors >= 3 ? 'text-red-600' : 'text-gray-700'}`}>
                {consecutiveErrors}
              </span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500 block text-xs">Total Errors</span>
              <span className="font-semibold text-gray-700">{totalErrors}</span>
            </div>
            {errorType === 'NOT_FOUND' && (
              <div className="bg-gray-50 rounded p-2">
                <span className="text-gray-500 block text-xs">Consecutive Blanks</span>
                <span className={`font-semibold ${consecutiveBlanks >= 3 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {consecutiveBlanks}
                </span>
              </div>
            )}
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500 block text-xs">Remaining in Queue</span>
              <span className="font-semibold text-gray-700">{remainingInQueue}</span>
            </div>
          </div>

          {/* Warning Messages */}
          {consecutiveErrors >= 3 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Multiple consecutive errors detected. Consider stopping to investigate the issue.
              </p>
            </div>
          )}

          {errorType === 'AUTH' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                <strong>Authentication errors will affect all remaining tournaments.</strong> You should stop and fix your API key before continuing.
              </p>
            </div>
          )}

          {errorType === 'NOT_FOUND' && consecutiveBlanks >= 3 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
              <Eye className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Multiple consecutive blank tournaments. You may have reached the end of published tournaments.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t bg-gray-50 flex flex-wrap justify-end gap-3">
          {canRetry && errorType !== 'AUTH' && (
            <button
              onClick={() => onDecision({ action: 'retry' })}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry This
            </button>
          )}
          
          {errorType !== 'AUTH' && remainingInQueue > 0 && (
            <button
              onClick={() => onDecision({ action: 'skip' })}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Skip & Continue ({remainingInQueue} left)
            </button>
          )}
          
          <button
            onClick={() => onDecision({ action: 'stop' })}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 flex items-center gap-2"
          >
            <StopCircle className="h-4 w-4" />
            Stop Processing
          </button>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// PROGRESS SUMMARY BAR (ENHANCED)
// ===================================================================

interface ProgressSummaryProps {
  results: ProcessingResult[];
  isProcessing: boolean;
  isPaused: boolean;
  mode: IdSelectionMode;
  flow: ScrapeFlow;
  consecutiveErrors: number;
  consecutiveBlanks: number;
  onStop: () => void;
}

const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  results, isProcessing, isPaused, mode, flow, consecutiveErrors, consecutiveBlanks, onStop
}) => {
  const total = results.length;
  const completed = results.filter(r => ['success', 'error', 'skipped'].includes(r.status)).length;
  const successful = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const inProgress = results.find(r => ['scraping', 'saving', 'review'].includes(r.status));
  
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  
  // Determine border color based on state
  const getBorderColor = () => {
    if (consecutiveErrors >= 3) return 'border-red-500';
    if (consecutiveBlanks >= 3) return 'border-amber-500';
    if (errors > 0) return 'border-yellow-500';
    return 'border-blue-500';
  };

  const getModeLabel = () => {
    switch (mode) {
      case 'next': return 'Next ID';
      case 'bulk': return 'Bulk';
      case 'range': return 'Range';
      case 'gaps': return 'Fill Gaps';
      case 'refresh': return 'Refresh';
      case 'auto': return 'Auto';
      default: return mode;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${getBorderColor()}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isPaused ? (
            <Pause className="h-5 w-5 text-purple-600" />
          ) : isProcessing ? (
            <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          ) : (
            <CheckCircle className="h-5 w-5 text-green-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isPaused ? 'Paused - Awaiting Decision' : isProcessing ? 'Processing...' : 'Complete'}
            </p>
            <p className="text-xs text-gray-500">
              {getModeLabel()} • {flow === 'scrape' ? 'Scrape Only' : 'Scrape + Save'}
              {consecutiveErrors > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  • {consecutiveErrors} consecutive errors
                </span>
              )}
              {consecutiveBlanks > 0 && mode === 'auto' && (
                <span className="ml-2 text-amber-600 font-medium">
                  • {consecutiveBlanks} blanks
                </span>
              )}
            </p>
          </div>
        </div>
        
        {isProcessing && !isPaused && (
          <button
            onClick={onStop}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 border border-red-300 rounded-md hover:bg-red-50 flex items-center gap-1"
            title="Stop processing after current item completes"
          >
            <StopCircle className="h-4 w-4" />
            {inProgress ? 'Stop After Current' : 'Stop'}
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div 
          className={`h-full transition-all duration-300 ${
            consecutiveErrors >= 3 ? 'bg-red-600' : 
            consecutiveBlanks >= 3 ? 'bg-amber-500' : 'bg-blue-600'
          }`}
          style={{ width: mode === 'auto' ? '100%' : `${progressPercent}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">
          {mode === 'auto' ? `${completed} processed` : `${completed} / ${total} processed`}
          {mode === 'auto' && isProcessing && <span className="ml-1 text-blue-500">(continuous)</span>}
        </span>
        <div className="flex items-center gap-3">
          {successful > 0 && (
            <span className="text-green-600 font-medium">✓ {successful}</span>
          )}
          {skipped > 0 && (
            <span className="text-gray-500 font-medium">⊘ {skipped}</span>
          )}
          {errors > 0 && (
            <span className="text-red-600 font-medium">✗ {errors}</span>
          )}
        </div>
      </div>

      {/* Currently Processing */}
      {inProgress && (
        <p className="text-xs text-blue-600 mt-2 truncate">
          {inProgress.status === 'review' ? '👁 Reviewing' : '⏳ Processing'} ID {inProgress.id}: {inProgress.message}
        </p>
      )}
    </div>
  );
};

// ===================================================================
// COLLAPSIBLE SECTION COMPONENT
// ===================================================================

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title, children, isOpen, onToggle, className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-gray-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 p-4">
          {children}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScrapeTab: React.FC<ScrapeTabProps> = ({ urlToReparse, onReparseComplete: _onReparseComplete }) => {
  const { currentEntity } = useEntity();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [defaultVenueId, setDefaultVenueId] = useState<string>('');
  const [entityDefaultVenueId, setEntityDefaultVenueId] = useState<string>('');
  const [isSavingDefaultVenue, setIsSavingDefaultVenue] = useState(false);

  // --- Section Collapse State ---
  const [_entitySectionOpen, setEntitySectionOpen] = useState(true);
  const [configSectionOpen, setConfigSectionOpen] = useState(true);

  // --- State for UI ---
  const [idSelectionMode, setIdSelectionMode] = useState<IdSelectionMode>('next');
  const [idSelectionParams, setIdSelectionParams] = useState<IdSelectionParams>({
    bulkCount: '10',
    rangeString: '',
  });
  const [scrapeFlow, setScrapeFlow] = useState<ScrapeFlow>('scrape');
  const [options, setOptions] = useState<ScrapeOptions>({
    useS3: true,
    skipManualReviews: false,
    ignoreDoNotScrape: false,
    skipInProgress: false,
    overrideExisting: false,
  });

  // API Key Configuration
  const [scraperApiKey, setScraperApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // NEW: Error tracking state
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [consecutiveBlanks, setConsecutiveBlanks] = useState(0);
  const [autoConfig] = useState<AutoProcessingConfig>(DEFAULT_AUTO_CONFIG);
  const [errorModal, setErrorModal] = useState<ErrorModalState | null>(null);
  const errorDecisionRef = useRef<((decision: ErrorDecision) => void) | null>(null);

  // Modals & Review
  const [gameForReview, setGameForReview] = useState<GameForReview | null>(null);
  const [selectedGameDetails, setSelectedGameDetails] = useState<ScrapedGameData | null>(null);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  
  const [scrapeOptionsModal, setScrapeOptionsModal] = useState<{
    isOpen: boolean;
    tournamentId: number;
    url: string;
    gameStatus?: string;
    isDoNotScrape?: boolean;
  } | null>(null);

  // Gap Tracker
  const {
    scrapingStatus,
    loading: gapLoading,
    getScrapingStatus,
    getBounds,
    bounds
  } = useGameIdTracking(currentEntity?.id);

  const highestTournamentId = scrapingStatus?.highestTournamentId ?? bounds?.highestId;

  // --- Effects ---
  useEffect(() => {
    if (currentEntity?.id) {
      fetchVenues();
      getScrapingStatus({ forceRefresh: false }).catch(err => {
        console.warn('[ScrapeTab] Initial scraping status fetch failed, trying bounds:', err);
        getBounds().catch(() => {});
      });
    }
  }, [currentEntity?.id]);

  useEffect(() => {
    if (currentEntity?.defaultVenueId) {
      setDefaultVenueId(currentEntity.defaultVenueId);
      setEntityDefaultVenueId(currentEntity.defaultVenueId);
    } else {
      setDefaultVenueId('');
      setEntityDefaultVenueId('');
    }
  }, [currentEntity?.defaultVenueId]);

  useEffect(() => {
    if (urlToReparse) {
      const match = urlToReparse.match(/[?&]id=(\d+)/);
      if (match) {
        const id = parseInt(match[1]);
        setIdSelectionMode('range');
        setIdSelectionParams(p => ({ ...p, rangeString: String(id) }));
      }
    }
  }, [urlToReparse]);

  // --- Data Fetching ---
  const fetchVenues = async () => {
    if (!currentEntity) return;
    try {
      const client = getClient();
      const response = await client.graphql({
        query: listVenuesForDropdown,
        variables: { 
          filter: { entityId: { eq: currentEntity.id } },
          limit: 100 
        }
      }) as any;
      
      const venueItems = (response.data?.listVenues?.items as Venue[]).filter(Boolean);
      setVenues(venueItems);
    } catch (error) {
      console.error('Error fetching venues:', error);
    }
  };

  const handleSaveDefaultVenue = async (venueId: string) => {
    if (!currentEntity || !venueId) return;
    setIsSavingDefaultVenue(true);
    try {
      const client = getClient();
      await client.graphql({
        query: `mutation UpdateEntity($input: UpdateEntityInput!) {
          updateEntity(input: $input) { id defaultVenueId }
        }`,
        variables: { 
          input: { 
            id: currentEntity.id, 
            defaultVenueId: venueId,
            _version: (currentEntity as any)._version 
          } 
        }
      });
      setEntityDefaultVenueId(venueId);
    } catch (error) {
      console.error('Error updating entity default venue:', error);
    } finally {
      setIsSavingDefaultVenue(false);
    }
  };

  // --- Queue Building ---
  const buildProcessingQueue = (): number[] => {
    if (!currentEntity) return [];

    switch (idSelectionMode) {
      case 'next':
        return [(highestTournamentId || 0) + 1];
        
      case 'bulk':
        const bulkCount = parseInt(idSelectionParams.bulkCount) || 10;
        const startId = (highestTournamentId || 0) + 1;
        return Array.from({ length: bulkCount }, (_, i) => startId + i);
        
      case 'range':
        if (!idSelectionParams.rangeString) return [];
        const rangeQueue: number[] = [];
        const parts = idSelectionParams.rangeString.split(',').map(s => s.trim());
        for (const part of parts) {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = start; i <= end; i++) rangeQueue.push(i);
            }
          } else {
            const num = parseInt(part);
            if (!isNaN(num)) rangeQueue.push(num);
          }
        }
        return rangeQueue;
        
      case 'gaps':
        if (!scrapingStatus?.gaps) return [];
        const gapQueue: number[] = [];
        for (const gap of scrapingStatus.gaps) {
          for (let i = gap.start; i <= gap.end; i++) {
            gapQueue.push(i);
          }
        }
        return gapQueue;
        
      case 'auto':
        // For auto mode, start with gaps first, then the next ID after highest
        // The processQueue will dynamically extend in auto mode
        const autoQueue: number[] = [];
        
        // First, add all gap IDs
        if (scrapingStatus?.gaps) {
          for (const gap of scrapingStatus.gaps) {
            for (let i = gap.start; i <= gap.end; i++) {
              autoQueue.push(i);
            }
          }
        }
        
        // Then add the next ID after highest (starting point for continuous scanning)
        const nextId = (highestTournamentId || 0) + 1;
        if (!autoQueue.includes(nextId)) {
          autoQueue.push(nextId);
        }
        
        // If no gaps and no highestTournamentId, start from 1
        if (autoQueue.length === 0) {
          autoQueue.push(1);
        }
        
        return autoQueue;
        
      default:
        return [];
    }
  };

  // --- Processing ---
  const handleStartProcessing = () => {
    if (!currentEntity) return;
    const queue = buildProcessingQueue();
    
    if (queue.length === 0) {
      alert("No IDs to process with the current selection.");
      return;
    }
    
    setEntitySectionOpen(false);
    setConfigSectionOpen(false);
    setApiKeyError(null);
    setIsProcessing(true);
    setIsPaused(false);
    setProcessingResults([]);
    
    // Reset error counters
    setConsecutiveErrors(0);
    setTotalErrors(0);
    setConsecutiveBlanks(0);
    
    abortControllerRef.current = new AbortController();
    
    const initialResults: ProcessingResult[] = queue.map(id => ({
      id,
      url: `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${id}`,
      status: 'pending',
      message: 'Waiting...'
    }));
    setProcessingResults(initialResults);
    
    processQueue(queue, abortControllerRef.current.signal);
  };

  const handleStopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setIsPaused(false);
  };

  // ===================================================================
  // ENHANCED: processQueue with comprehensive error handling
  // For AUTO mode: dynamically extends queue after each successful process
  // ===================================================================
  const processQueue = async (initialQueue: number[], signal: AbortSignal) => {
    let localConsecutiveErrors = 0;
    let localTotalErrors = 0;
    let localConsecutiveBlanks = 0;
    
    // Use mutable queue for auto mode extension
    const queue = [...initialQueue];
    let highestProcessedId = Math.max(...queue);
    
    // Helper: Extend queue in auto mode after successful/skipped item
    const extendQueueInAutoMode = (currentTournamentId: number) => {
      console.log('[Auto Mode] extendQueueInAutoMode called', { 
        currentTournamentId, 
        idSelectionMode, 
        signalAborted: signal.aborted,
        currentQueueLength: queue.length 
      });
      
      if (idSelectionMode === 'auto' && !signal.aborted) {
        const nextId = currentTournamentId + 1;
        if (!queue.includes(nextId)) {
          queue.push(nextId);
          highestProcessedId = Math.max(highestProcessedId, nextId);
          console.log('[Auto Mode] Extended queue with ID', nextId, 'new length:', queue.length);
          // Add to results display
          setProcessingResults(prev => [...prev, {
            id: nextId,
            url: `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${nextId}`,
            status: 'pending',
            message: 'Waiting...'
          }]);
        } else {
          console.log('[Auto Mode] Queue already contains', nextId);
        }
      } else {
        console.log('[Auto Mode] NOT extending - mode:', idSelectionMode, 'aborted:', signal.aborted);
      }
    };
    
    for (let i = 0; i < queue.length; i++) {
      console.log('[ProcessQueue] Loop iteration', { i, queueLength: queue.length, tournamentId: queue[i], signalAborted: signal.aborted });
      if (signal.aborted) break;

      const tournamentId = queue[i];
      const url = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;

      setProcessingResults(prev => prev.map(r =>
        r.id === tournamentId ? { ...r, status: 'scraping', message: 'Scraping...', parsedData: r.parsedData } : r
      ));

      try {
        const parsedData = await fetchGameDataFromBackend(
          url,
          !options.useS3,
          scraperApiKey,
          currentEntity?.id
        );

        // --- Check for error responses embedded in parsedData ---
        const errorMsg = (parsedData as any).error || (parsedData as any).errorMessage;
        const isCriticalError = parsedData.name === 'Error processing tournament' || (parsedData as any).status === 'ERROR';

        if (errorMsg || isCriticalError) {
          const finalErrorMsg = errorMsg || (parsedData as any).message || 'Scraper Error';
          const errorType = classifyError(finalErrorMsg, parsedData);
          
          // Update error counters
          localConsecutiveErrors++;
          localTotalErrors++;
          setConsecutiveErrors(localConsecutiveErrors);
          setTotalErrors(localTotalErrors);
          
          // Track blanks separately
          if (errorType === 'NOT_FOUND') {
            localConsecutiveBlanks++;
            setConsecutiveBlanks(localConsecutiveBlanks);
          } else {
            localConsecutiveBlanks = 0;
            setConsecutiveBlanks(0);
          }

          // AUTH errors always stop immediately
          if (shouldStopImmediately(errorType)) {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? { 
                ...r, 
                status: 'error', 
                message: `AUTH ERROR: ${finalErrorMsg}`,
                errorType 
              } : r
            ));
            setApiKeyError("ScraperAPI Key is invalid, expired, or unauthorized. Processing stopped.");
            setConfigSectionOpen(true);
            setIsProcessing(false);
            return;
          }

          // Auto-retry transient errors once (if enabled)
          if (isTransientError(errorType) && autoConfig.autoRetryTransientErrors && localConsecutiveErrors === 1) {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? { 
                ...r, 
                status: 'scraping', 
                message: `Auto-retrying after ${errorType} error...` 
              } : r
            ));
            
            await new Promise(resolve => setTimeout(resolve, autoConfig.retryDelayMs));
            
            try {
              const retryData = await fetchGameDataFromBackend(
                url,
                !options.useS3,
                scraperApiKey,
                currentEntity?.id
              );
              
              // If retry succeeds, use retry data and reset counters
              if (!(retryData as any).error && !(retryData as any).errorMessage) {
                localConsecutiveErrors = 0;
                localConsecutiveBlanks = 0;
                setConsecutiveErrors(0);
                setConsecutiveBlanks(0);
                
                // Continue processing with the successful retry data
                setProcessingResults(prev => prev.map(r =>
                  r.id === tournamentId ? { 
                    ...r, 
                    status: 'success', 
                    message: 'Scraped (after retry)',
                    parsedData: retryData
                  } : r
                ));
                extendQueueInAutoMode(tournamentId);
                continue;
              }
            } catch (retryError) {
              // Retry also failed, fall through to decision logic
              console.warn('[ScrapeTab] Auto-retry also failed:', retryError);
            }
          }

          // Check if we should pause for user decision
          const shouldPauseForDecision = (
            // In auto mode with thresholds exceeded
            (idSelectionMode === 'auto' && (
              localConsecutiveErrors >= autoConfig.maxConsecutiveErrors ||
              localTotalErrors >= autoConfig.maxTotalErrors ||
              localConsecutiveBlanks >= autoConfig.maxConsecutiveBlanks ||
              (errorType === 'UNKNOWN' && autoConfig.pauseOnUnknownError)
            )) ||
            // Or any mode with unknown errors (if configured)
            (errorType === 'UNKNOWN' && autoConfig.pauseOnUnknownError)
          );

          if (shouldPauseForDecision && !options.skipManualReviews) {
            // Pause and show error modal
            setIsPaused(true);
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? { 
                ...r, 
                status: 'error', 
                message: finalErrorMsg,
                errorType 
              } : r
            ));

            // Wait for user decision
            const decision = await new Promise<ErrorDecision>((resolve) => {
              setErrorModal({
                isOpen: true,
                tournamentId,
                url,
                errorType,
                errorMessage: finalErrorMsg,
                canRetry: isTransientError(errorType)
              });
              errorDecisionRef.current = resolve;
            });

            setErrorModal(null);
            setIsPaused(false);

            if (decision.action === 'stop') {
              setIsProcessing(false);
              return;
            } else if (decision.action === 'retry') {
              // Decrement i to retry this item
              i--;
              localConsecutiveErrors = Math.max(0, localConsecutiveErrors - 1);
              setConsecutiveErrors(localConsecutiveErrors);
              continue;
            }
            // 'skip' falls through to continue
            continue;
          }

          // Not pausing - just log error and continue
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { 
              ...r, 
              status: 'error', 
              message: finalErrorMsg,
              errorType 
            } : r
          ));
          continue;
        }

        // ============================================================
        // SUCCESS PATH - Reset consecutive error counters
        // ============================================================
        localConsecutiveErrors = 0;
        localConsecutiveBlanks = 0;
        setConsecutiveErrors(0);
        setConsecutiveBlanks(0);

        // --- Handle special cases: DO_NOT_SCRAPE, NOT_PUBLISHED ---
        const isSkippedDoNotScrape = 
          ((parsedData as any).skipped && (parsedData as any).skipReason === 'DO_NOT_SCRAPE') ||
          (parsedData.doNotScrape && parsedData.name?.includes('Skipped')) ||
          (parsedData.name === 'Skipped - Do Not Scrape');

        const isNotPublished = parsedData.gameStatus === 'NOT_PUBLISHED';

        if ((isSkippedDoNotScrape && !options.ignoreDoNotScrape) || isNotPublished) {
          // --- AUTO-SAVE FOR NOT_PUBLISHED WITH SKIP MANUAL REVIEWS ---
          if (isNotPublished && options.skipManualReviews) {
            if (scrapeFlow === 'scrape_save') {
              try {
                setProcessingResults(prev => prev.map(r =>
                  r.id === tournamentId ? { ...r, status: 'saving', message: 'Auto-saving NOT_PUBLISHED...' } : r
                ));
                
                const sourceUrl = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
                const sanitizedData = sanitizeGameDataForPlaceholder(parsedData);
                
                const saveResult = await saveGameDataToBackend(
                  sourceUrl,
                  defaultVenueId,
                  sanitizedData,
                  null,
                  currentEntity?.id || ''
                );
                
                setProcessingResults(prev => prev.map(r =>
                  r.id === tournamentId ? {
                    ...r,
                    status: 'success',
                    message: 'Saved (NOT_PUBLISHED - auto)',
                    parsedData: sanitizedData,
                    savedGameId: saveResult.gameId || undefined
                  } : r
                ));
                extendQueueInAutoMode(tournamentId);
                continue;
              } catch (error: any) {
                // Save error - track it
                localConsecutiveErrors++;
                localTotalErrors++;
                setConsecutiveErrors(localConsecutiveErrors);
                setTotalErrors(localTotalErrors);
                
                setProcessingResults(prev => prev.map(r =>
                  r.id === tournamentId ? {
                    ...r,
                    status: 'error',
                    message: `Failed to save NOT_PUBLISHED: ${error.message}`,
                    parsedData,
                    errorType: 'SAVE'
                  } : r
                ));
                continue;
              }
            } else {
              // Scrape-only mode, just mark as skipped
              setProcessingResults(prev => prev.map(r =>
                r.id === tournamentId ? {
                  ...r,
                  status: 'skipped',
                  message: `Skipped (${parsedData.gameStatus})`,
                  parsedData
                } : r
              ));
              extendQueueInAutoMode(tournamentId);
              continue;
            }
          }

          // --- MANUAL REVIEW LOGIC ---
          setIsPaused(true);
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'review',
              message: isNotPublished 
                ? 'Tournament not published - choose save option...'
                : 'Tournament marked as Do Not Scrape - awaiting decision...',
              parsedData
            } : r
          ));

          const modalResult = await new Promise<{ action: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER', s3Key?: string }>((resolve) => {
            setScrapeOptionsModal({
              isOpen: true,
              tournamentId,
              url,
              gameStatus: parsedData.gameStatus || undefined,
              isDoNotScrape: isSkippedDoNotScrape
            });
            (window as any).__scrapeOptionsResolver = resolve;
          });

          setScrapeOptionsModal(null);
          setIsPaused(false);

          if (modalResult.action === 'SAVE_PLACEHOLDER') {
            console.log('[ProcessQueue] SAVE_PLACEHOLDER selected for tournament', tournamentId);
            try {
              setProcessingResults(prev => prev.map(r =>
                r.id === tournamentId ? { ...r, status: 'saving', message: 'Saving NOT_PUBLISHED placeholder...' } : r
              ));
              
              const sourceUrl = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
              const sanitizedData = sanitizeGameDataForPlaceholder(parsedData);
              
              const saveResult = await saveGameDataToBackend(
                sourceUrl,
                defaultVenueId,
                sanitizedData,
                null,
                currentEntity?.id || ''
              );
              
              console.log('[ProcessQueue] SAVE_PLACEHOLDER success, calling extendQueueInAutoMode');
              setProcessingResults(prev => prev.map(r =>
                r.id === tournamentId ? {
                  ...r,
                  status: 'success',
                  message: 'Saved (NOT_PUBLISHED placeholder)',
                  parsedData: sanitizedData,
                  savedGameId: saveResult.gameId || undefined
                } : r
              ));

              await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });
              extendQueueInAutoMode(tournamentId);
              console.log('[ProcessQueue] After extendQueueInAutoMode, continuing loop');
            } catch (error: any) {
              console.error('[ProcessQueue] SAVE_PLACEHOLDER error:', error);
              setProcessingResults(prev => prev.map(r =>
                r.id === tournamentId ? {
                  ...r,
                  status: 'error',
                  message: `Failed to save placeholder: ${error.message}`,
                  parsedData,
                  errorType: 'SAVE'
                } : r
              ));
            }
            continue;
          }

          if (modalResult.action === 'SKIP' || signal.aborted) {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? {
                ...r,
                status: 'skipped',
                message: `Skipped (${parsedData.gameStatus || 'Do Not Scrape'})`,
                parsedData
              } : r
            ));
            extendQueueInAutoMode(tournamentId);
            continue;
          }

          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { ...r, status: 'scraping', message: `Fetching from ${modalResult.action}...`, parsedData } : r
          ));

          const refetchedData = await fetchGameDataFromBackend(
            url,
            modalResult.action === 'LIVE',
            scraperApiKey,
            currentEntity?.id
          );
          Object.assign(parsedData, refetchedData);
        }

        // --- Skip in-progress games if option set ---
        if (options.skipInProgress && (parsedData.gameStatus === 'RUNNING' || parsedData.gameStatus === 'SCHEDULED')) {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'skipped',
              message: `Skipped (${parsedData.gameStatus})`,
              parsedData
            } : r
          ));
          extendQueueInAutoMode(tournamentId);
          continue;
        }

        // --- Scrape-only flow ---
        if (scrapeFlow === 'scrape') {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'success',
              message: 'Scraped (not saved)',
              parsedData
            } : r
          ));
          extendQueueInAutoMode(tournamentId);
          continue;
        }

        // --- Scrape + Save flow ---
        // Venue determination
        const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
        let venueIdToUse = '';
        
        if (options.skipManualReviews) {
          venueIdToUse = autoVenueId || defaultVenueId;
          if (autoVenueId) {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? { ...r, autoVenueId: venueIdToUse } : r
            ));
          }
        } else {
          const venueConfidence = parsedData.venueMatch?.autoAssignedVenue?.score ?? 0;
          
          if (venueConfidence >= 0.6) {
            venueIdToUse = autoVenueId || '';
          } else {
            const suggestedVenueId = autoVenueId || defaultVenueId || '';
            
            setIsPaused(true);
            const modalResult = await showSaveConfirmationModal(parsedData, suggestedVenueId, currentEntity?.id || '');
            setIsPaused(false);
            
            if (modalResult.action === 'cancel') {
              setProcessingResults(prev => prev.map(r =>
                r.id === tournamentId ? { ...r, status: 'error', message: 'No venue selected', parsedData: parsedData } : r
              ));
              continue;
            }
            
            venueIdToUse = modalResult.venueId || suggestedVenueId;
          }
        }

        // --- Save the game ---
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? { ...r, status: 'saving', message: 'Saving to Game table...', parsedData, selectedVenueId: venueIdToUse } : r
        ));

        const sourceUrl = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
        const sanitizedData = {
          ...parsedData,
          gameStartDateTime: parsedData.gameStartDateTime ?? undefined
        };

        const saveResult = await saveGameDataToBackend(
          sourceUrl,
          venueIdToUse,
          sanitizedData,
          null,
          currentEntity?.id || ''
        );

        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'success',
            message: 'Successfully saved',
            parsedData,
            savedGameId: saveResult.gameId || undefined
          } : r
        ));

        await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });
        
        // AUTO MODE: Extend queue with next ID
        extendQueueInAutoMode(tournamentId);

      } catch (error: any) {
        // ============================================================
        // CATCH BLOCK - Handle unexpected errors
        // ============================================================
        const errorMsg = error.message || 'Unknown error';
        const errorType = classifyError(error);
        
        localConsecutiveErrors++;
        localTotalErrors++;
        setConsecutiveErrors(localConsecutiveErrors);
        setTotalErrors(localTotalErrors);
        
        // Track blanks
        if (errorType === 'NOT_FOUND') {
          localConsecutiveBlanks++;
          setConsecutiveBlanks(localConsecutiveBlanks);
        } else {
          localConsecutiveBlanks = 0;
          setConsecutiveBlanks(0);
        }

        // AUTH errors stop immediately
        if (shouldStopImmediately(errorType)) {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'error',
              message: `AUTH ERROR: ${errorMsg}`,
              errorType
            } : r
          ));
          setApiKeyError("API Key is invalid or expired. Check logs.");
          setConfigSectionOpen(true);
          setIsProcessing(false);
          return;
        }

        // Check if we should pause for decision
        const shouldPauseForDecision = (
          (idSelectionMode === 'auto' && (
            localConsecutiveErrors >= autoConfig.maxConsecutiveErrors ||
            localTotalErrors >= autoConfig.maxTotalErrors ||
            localConsecutiveBlanks >= autoConfig.maxConsecutiveBlanks ||
            (errorType === 'UNKNOWN' && autoConfig.pauseOnUnknownError)
          )) ||
          (errorType === 'UNKNOWN' && autoConfig.pauseOnUnknownError)
        );

        if (shouldPauseForDecision && !options.skipManualReviews) {
          setIsPaused(true);
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { 
              ...r, 
              status: 'error', 
              message: errorMsg,
              errorType 
            } : r
          ));

          const decision = await new Promise<ErrorDecision>((resolve) => {
            setErrorModal({
              isOpen: true,
              tournamentId,
              url,
              errorType,
              errorMessage: errorMsg,
              canRetry: isTransientError(errorType)
            });
            errorDecisionRef.current = resolve;
          });

          setErrorModal(null);
          setIsPaused(false);

          if (decision.action === 'stop') {
            setIsProcessing(false);
            return;
          } else if (decision.action === 'retry') {
            i--;
            localConsecutiveErrors = Math.max(0, localConsecutiveErrors - 1);
            setConsecutiveErrors(localConsecutiveErrors);
            continue;
          }
          continue;
        }
        
        // Just log and continue
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'error',
            message: errorMsg,
            errorType
          } : r
        ));
      }
    }
    
    // Processing complete
    console.log('[ProcessQueue] Loop exited', { 
      finalQueueLength: queue.length, 
      signalAborted: signal.aborted,
      localConsecutiveErrors,
      localTotalErrors,
      localConsecutiveBlanks
    });
    setIsProcessing(false);
  };

  // --- Handle error modal decision ---
  const handleErrorDecision = (decision: ErrorDecision) => {
    if (errorDecisionRef.current) {
      errorDecisionRef.current(decision);
      errorDecisionRef.current = null;
    }
  };

  // --- Manual Save Handler ---
  const handleManualSave = async (result: ProcessingResult) => {
    if (!currentEntity || !result.parsedData) return;
    
    if (result.parsedData.gameStatus === 'NOT_PUBLISHED') {
      const confirmed = window.confirm(
        `Save tournament ${result.id} as NOT_PUBLISHED placeholder?\n\n` +
        `This will create a minimal database record to track this tournament ID.`
      );
      
      if (!confirmed) {
        setProcessingResults(prev => prev.map(r =>
          r.id === result.id ? { ...r, status: 'pending', message: 'Save cancelled' } : r
        ));
        return;
      }
      
      setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { ...r, status: 'saving', message: 'Saving NOT_PUBLISHED placeholder...' } : r
      ));
      
      try {
        const sourceUrl = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${result.id}`;
        const sanitizedData = sanitizeGameDataForPlaceholder(result.parsedData);
        
        const saveResult = await saveGameDataToBackend(
          sourceUrl,
          result.selectedVenueId || defaultVenueId,
          sanitizedData,
          null,
          currentEntity.id
        );
        
        setProcessingResults(prev => prev.map(r =>
          r.id === result.id ? {
            ...r,
            status: 'success',
            message: 'Saved (NOT_PUBLISHED placeholder)',
            savedGameId: saveResult.gameId || undefined
          } : r
        ));

        await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });

      } catch (error: any) {
        setProcessingResults(prev => prev.map(r =>
          r.id === result.id ? {
            ...r,
            status: 'error',
            message: `Failed to save: ${error.message}`
          } : r
        ));
      }
      return;
    }

    setIsPaused(true);
    setProcessingResults(prev => prev.map(r =>
      r.id === result.id ? { ...r, status: 'review', message: 'Opening for review...', parsedData: r.parsedData } : r
    ));
    
    const modalResult = await showSaveConfirmationModal(
      result.parsedData, 
      result.selectedVenueId || defaultVenueId || '',
      currentEntity.id
    );
    
    setIsPaused(false);
    
    if (modalResult.action === 'cancel') {
      setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { ...r, status: 'pending', message: 'Save cancelled' } : r
      ));
      return;
    }
    
    setProcessingResults(prev => prev.map(r =>
      r.id === result.id ? { ...r, status: 'saving', message: 'Saving to Game...' } : r
    ));
    
    try {
      const dataToSave = modalResult.gameData || result.parsedData;
      const sourceUrl = (dataToSave as any).sourceUrl || 
        `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${dataToSave.tournamentId}`;
      
      const sanitizedData = {
        ...dataToSave,
        gameStartDateTime: dataToSave.gameStartDateTime ?? undefined
      } as any;
      
      const saveResult = await saveGameDataToBackend(
        sourceUrl,
        modalResult.venueId || result.selectedVenueId || '',
        sanitizedData,
        (dataToSave as any).existingGameId || null,
        currentEntity.id,
        {
          wasEdited: modalResult.gameData ? true : false,
          originalData: modalResult.gameData ? result.parsedData : undefined
        }
      );

      setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { 
          ...r, 
          status: 'success', 
          message: 'Successfully saved',
          savedGameId: saveResult.gameId || undefined
        } : r
      ));

      await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });
      
    } catch (error: any) {
      setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { ...r, status: 'error', message: error.message || 'Save failed' } : r
      ));
    }
  };

  const handleResultVenueChange = (resultId: number, venueId: string) => {
    setProcessingResults(prev => prev.map(r =>
      r.id === resultId ? { ...r, selectedVenueId: venueId } : r
    ));
  };

  const showSaveConfirmationModal = (game: ScrapedGameData, venueId: string, entityId: string): Promise<ModalResolverValue> => {
    return new Promise((resolve) => {
      setGameForReview({ game, venueId, entityId });
      (window as any).__modalResolver = (result: ModalResolverValue) => {
        setGameForReview(null);
        resolve(result);
      };
    });
  };

  const handleModalConfirm = (editedGame: GameData, venueId: string) => {
    if ((window as any).__modalResolver) {
      (window as any).__modalResolver({ action: 'save', gameData: editedGame, venueId });
    }
  };

  const handleModalClose = () => {
    if ((window as any).__modalResolver) {
      (window as any).__modalResolver({ action: 'cancel' });
    }
    setGameForReview(null);
  };

  // Helper to convert ProcessingResult to GameState for GameListItem
  const resultToGameState = (result: ProcessingResult): GameState => {
    const gameData = result.parsedData ? {
      ...result.parsedData,
      gameStartDateTime: result.parsedData.gameStartDateTime ?? undefined,
    } : undefined;

    const isSuccessfulSave = result.status === 'success' && 
      (result.savedGameId || 
       result.message.includes('Successfully saved') || 
       result.message.includes('Saved (NOT_PUBLISHED'));

    return {
      id: result.url,
      source: 'SCRAPER' as any,
      data: gameData as any,
      jobStatus: result.status === 'scraping' ? 'SCRAPING' : 
                 result.status === 'saving' ? 'SAVING' : 
                 result.status === 'success' ? 'DONE' :
                 result.status === 'error' ? 'ERROR' : 'IDLE',
      errorMessage: result.status === 'error' ? result.message : undefined,
      existingGameId: result.savedGameId || result.parsedData?.existingGameId,
      saveResult: isSuccessfulSave 
        ? { id: result.savedGameId || result.parsedData?.existingGameId || 'saved' } 
        : undefined,
      fetchCount: 1,
    };
  };

  // --- Render Helpers ---
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
        return (
          <div className="text-sm text-gray-600 mt-1 p-2 bg-amber-50 border border-amber-200 rounded">
            <p className="font-medium text-amber-800">Auto Mode</p>
            <p className="text-xs text-amber-700">
              Will fill gaps first, then scan new IDs. Pauses on any error or after {autoConfig.maxConsecutiveBlanks} consecutive blanks for your decision.
            </p>
          </div>
        );
      default:
        return (
          <div className="text-sm text-gray-600 mt-1">
            Next ID: <strong>{(highestTournamentId || 0) + 1}</strong>
          </div>
        );
    }
  };

  // --- API Key Config Render ---
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

  // --- Main Render ---
  if (!currentEntity) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium mb-2">No Entity Selected</p>
        <p className="text-sm text-yellow-700">
          Please select an entity from the sidebar to use the scraper.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scraper Configuration - Collapsible */}
      <CollapsibleSection
        title={
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Scraper Configuration: {currentEntity.entityName} ({currentEntity.gameUrlDomain})</span>
            {apiKeyError && <span className="ml-2 text-xs text-white bg-red-600 px-2 py-0.5 rounded-full">Auth Error</span>}
          </div>
        }
        isOpen={configSectionOpen}
        onToggle={() => setConfigSectionOpen(!configSectionOpen)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="space-y-4">
            {/* Options Checkboxes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Options</label>
              {[
                { key: 'useS3', label: 'Use S3 Cache', desc: 'Fetch from S3 first if available' },
                { key: 'skipManualReviews', label: 'Skip Manual Reviews', desc: 'Auto-save with defaults' },
                { key: 'ignoreDoNotScrape', label: 'Ignore Do Not Scrape', desc: 'Process marked tournaments' },
                { key: 'skipInProgress', label: 'Skip In-Progress', desc: 'Skip RUNNING/SCHEDULED' },
              ].map(opt => (
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
                    onClick={() => handleSaveDefaultVenue(defaultVenueId)}
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
        </div>

        {/* Start Button */}
        <div className="mt-6 pt-4 border-t">
          <button
            onClick={handleStartProcessing}
            disabled={isProcessing || gapLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Play className="h-5 w-5" />
            Start Processing
          </button>
        </div>
      </CollapsibleSection>

      {/* Progress Summary */}
      {processingResults.length > 0 && (
        <ProgressSummary
          results={processingResults}
          isProcessing={isProcessing}
          isPaused={isPaused}
          mode={idSelectionMode}
          flow={scrapeFlow}
          consecutiveErrors={consecutiveErrors}
          consecutiveBlanks={consecutiveBlanks}
          onStop={handleStopProcessing}
        />
      )}

      {/* Results List */}
      {processingResults.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900">Processing Results</h3>
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto space-y-2">
            {[...processingResults].reverse().map((result) => (
              <GameListItem
                key={result.id}
                game={resultToGameState(result)}
                venues={venues}
                selectedVenueId={result.selectedVenueId}
                onVenueChange={(venueId) => handleResultVenueChange(result.id, venueId)}
                onSave={() => handleManualSave(result)}
                onViewDetails={result.parsedData ? () => setSelectedGameDetails(result.parsedData!) : undefined}
                showVenueSelector={true}
                showActions={true}
                compact={true}
                processingStatus={result.status}
                processingMessage={result.message}
                tournamentId={result.id}
                sourceUrl={result.url}
                dataSource={(() => {
                  if (result.status === 'pending' || result.status === 'scraping') {
                    return 'pending'; 
                  }
                  const source = (result.parsedData as any)?.source;
                  const s3Key = result.parsedData?.s3Key;
                  const skipped = (result.parsedData as any)?.skipped;
                  
                  if (skipped) return 'none';
                  if (source === 'S3_CACHE' || source === 'HTTP_304_CACHE' || s3Key) return 's3';
                  if (source === 'LIVE') return 'web';
                  
                  return 'pending';
                })() as 's3' | 'web' | 'none' | 'pending'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedGameDetails && (
        <GameDetailsModal
          game={{ data: selectedGameDetails }}
          onClose={() => setSelectedGameDetails(null)}
        />
      )}

      {gameForReview && (
        <SaveConfirmationModal
          isOpen={true}
          onClose={handleModalClose}
          onConfirm={(editedData) => handleModalConfirm(editedData, gameForReview.venueId)}
          gameData={gameForReview.game}
          venueId={gameForReview.venueId}
          sourceUrl={
            gameForReview.game.sourceUrl || 
            (currentEntity ? `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${gameForReview.game.tournamentId}` : 
            `Tournament ID: ${gameForReview.game.tournamentId}`)
          }
          entityId={currentEntity?.id}
          autoMode={idSelectionMode === 'auto'}
          skipConfirmation={options.skipManualReviews}
        />
      )}

      {venueModalOpen && (
        <VenueModal
          isOpen={venueModalOpen}
          onClose={() => setVenueModalOpen(false)}
          onSave={async () => console.log('Venue save triggered')}
          venue={null}
          entities={currentEntity ? [currentEntity] : []}
        />
      )}

      {scrapeOptionsModal && (
        <ScrapeOptionsModal
          isOpen={scrapeOptionsModal.isOpen}
          onClose={() => {
            if ((window as any).__scrapeOptionsResolver) {
              (window as any).__scrapeOptionsResolver({ action: 'SKIP' });
            }
            setScrapeOptionsModal(null);
          }}
          onSelectOption={(option, s3Key) => {
            if ((window as any).__scrapeOptionsResolver) {
              (window as any).__scrapeOptionsResolver({ action: option, s3Key });
            }
            setScrapeOptionsModal(null);
          }}
          url={scrapeOptionsModal.url}
          entityId={currentEntity?.id || ''}
          doNotScrape={scrapeOptionsModal.isDoNotScrape || false}
          gameStatus={scrapeOptionsModal.gameStatus}
          warningMessage={
            scrapeOptionsModal.gameStatus === 'NOT_PUBLISHED'
              ? "This tournament is not published yet. You can save it as a placeholder to track this ID."
              : "This tournament is marked as 'Do Not Scrape'. You can use cached S3 data or force a live scrape."
          }
        />
      )}

      {/* NEW: Error Handling Modal */}
      {errorModal && (
        <ErrorHandlingModal
          {...errorModal}
          consecutiveErrors={consecutiveErrors}
          totalErrors={totalErrors}
          consecutiveBlanks={consecutiveBlanks}
          remainingInQueue={processingResults.filter(r => r.status === 'pending').length}
          onDecision={handleErrorDecision}
        />
      )}
    </div>
  );
};
