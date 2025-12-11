// src/components/scraper/GameListItem.tsx
// SIMPLIFIED: Reduced from ~870 lines to ~400 lines
// Uses extracted StatusBadges components

import React, { useState, useEffect } from 'react';
import { 
  Save, Eye, RefreshCw, XCircle, AlertCircle, Clock, Users, DollarSign, 
  ChevronDown, Database, CheckCircle, Loader2, AlertTriangle
} from 'lucide-react';
import type { GameState } from '../../types/game';
import type { Venue } from '../../API';
import { POLLING_INTERVAL } from '../../hooks/useGameTracker';
import { DataSourceBadge, type DataSourceType, type ProcessingStatusType } from './shared/StatusBadges';

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getListItemColorClass = (gameStatus?: string, registrationStatus?: string): string => {
  const statusColors: Record<string, string> = {
    'RUNNING': registrationStatus === 'CLOSED' 
      ? 'bg-green-100 border-green-300 hover:bg-green-150'
      : 'bg-green-50 border-green-200 hover:bg-green-100',
    'SCHEDULED': 'bg-blue-50 border-blue-100 hover:bg-blue-100',
    'REGISTERING': 'bg-orange-50 border-orange-100 hover:bg-orange-100',
    'CLOCK STOPPED': 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
    'FINISHED': 'bg-gray-50 border-gray-200 hover:bg-gray-100',
  };
  return statusColors[gameStatus || ''] || 'bg-white border-gray-200 hover:bg-gray-50';
};

const getProcessingStatusStyles = (status: ProcessingStatusType, isNotPublished?: boolean): string => {
  // NOT_PUBLISHED games get grey styling regardless of success status
  if (isNotPublished) {
    return 'bg-gray-100 border-gray-300';
  }
  
  const styles: Record<ProcessingStatusType, string> = {
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-300',
    error: 'bg-red-50 border-red-200',
    skipped: 'bg-yellow-50 border-yellow-200',
    scraping: 'bg-blue-50 border-blue-200',
    saving: 'bg-blue-50 border-blue-200',
    review: 'bg-purple-50 border-purple-300',
    pending: 'bg-gray-50 border-gray-200',
  };
  return styles[status] || 'bg-gray-50 border-gray-200';
};

const getStatusIcon = (status: ProcessingStatusType) => {
  const icons: Record<ProcessingStatusType, typeof CheckCircle> = {
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
    scraping: Loader2,
    saving: Loader2,
    review: Eye,
    skipped: AlertCircle,
    pending: Clock,
  };
  return icons[status] || Clock;
};

const getStatusIconColor = (status: ProcessingStatusType, isNotPublished?: boolean): string => {
  // NOT_PUBLISHED gets grey icon
  if (isNotPublished && status === 'success') {
    return 'text-gray-400';
  }
  
  const colors: Record<ProcessingStatusType, string> = {
    success: 'text-green-600',
    warning: 'text-amber-600',
    error: 'text-red-600',
    scraping: 'text-blue-600',
    saving: 'text-blue-600',
    review: 'text-purple-600',
    skipped: 'text-yellow-600',
    pending: 'text-gray-400',
  };
  return colors[status] || 'text-gray-400';
};

// Format game datetime for display
const formatGameDateTime = (dateTimeString?: string | null): string | null => {
  if (!dateTimeString) return null;
  try {
    const date = new Date(dateTimeString);
    
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    return date.toLocaleString('en-AU', options);
  } catch {
    return null;
  }
};

// ===================================================================
// PROPS
// ===================================================================

interface GameListItemProps {
  game: GameState;
  venues?: Venue[];
  venuesLoading?: boolean;
  selectedVenueId?: string;
  onVenueChange?: (venueId: string) => void;
  onSave?: () => void;
  onRemove?: () => void;
  onRefresh?: () => void;
  onViewDetails?: () => void;
  showVenueSelector?: boolean;
  showActions?: boolean;
  onClick?: () => void;
  enableCreateVenue?: boolean;
  dataSource?: DataSourceType;
  compact?: boolean;
  processingStatus?: ProcessingStatusType;
  processingMessage?: string;
  tournamentId?: number;
  sourceUrl?: string;
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const GameListItem: React.FC<GameListItemProps> = ({
  game,
  venues = [],
  venuesLoading = false,
  selectedVenueId,
  onVenueChange,
  onSave,
  onRemove,
  onRefresh,
  onViewDetails,
  showVenueSelector = true,
  showActions = true,
  onClick,
  enableCreateVenue = false,
  dataSource,
  compact = false,
  processingStatus,
  processingMessage,
  tournamentId,
  sourceUrl: _sourceUrl, // Prefixed to indicate intentionally unused
}) => {
  const [countdown, setCountdown] = useState('');
  const needsVenueSelection = showVenueSelector && !selectedVenueId && !game.existingGameId && !game.saveResult;
  const [isExpanded, setIsExpanded] = useState(compact ? false : needsVenueSelection);

  useEffect(() => {
    if (needsVenueSelection && !isExpanded && !compact) {
      setIsExpanded(true);
    }
  }, [needsVenueSelection, compact]);

  // Auto-refresh countdown
  useEffect(() => {
    if (!game.autoRefresh || !game.lastFetched || game.data?.doNotScrape) return;
    
    const calculateCountdown = () => {
      const lastFetchTime = new Date(game.lastFetched as string).getTime();
      const remaining = lastFetchTime + POLLING_INTERVAL - Date.now();
      if (remaining <= 0) {
        setCountdown('Refreshing...');
      } else {
        const mins = Math.floor((remaining % 3600000) / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [game.autoRefresh, game.lastFetched, game.data?.doNotScrape]);

  const data = game.data;
  const hasError = !!game.errorMessage;
  const hasDoNotScrape = !!data?.doNotScrape;

  const getDisplayId = (id: string) => {
    if (id.startsWith('http')) {
      const url = new URL(id);
      return url.searchParams.get('id') || url.pathname.split('/').pop() || id.substring(0, 20);
    }
    return id.substring(0, 20);
  };

  const formatVenueOption = (venue: Venue) => 
    venue.venueNumber !== undefined ? `${venue.venueNumber} - ${venue.name}` : venue.name;

  // ===================================================================
  // COMPACT MODE
  // ===================================================================
  if (compact) {
    const StatusIcon = getStatusIcon(processingStatus || 'pending');
    const isAnimating = processingStatus === 'scraping' || processingStatus === 'saving';
    const isNotPublished = data?.gameStatus === 'NOT_PUBLISHED';
    const formattedDateTime = formatGameDateTime(data?.gameStartDateTime);

    return (
      <div
        className={`border rounded-lg overflow-hidden transition-colors ${getProcessingStatusStyles(processingStatus || 'pending', isNotPublished)} ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
      >
        {/* Compact Header - Two Row Layout */}
        <div className="p-3">
          {/* Row 1: ID, Status Badge, Actions */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Icon + ID + Status */}
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon className={`h-5 w-5 flex-shrink-0 ${getStatusIconColor(processingStatus || 'pending', isNotPublished)} ${isAnimating ? 'animate-spin' : ''}`} />
              
              <span className="text-base font-semibold text-gray-900">
                {tournamentId || getDisplayId(game.id)}
              </span>
              
              {processingStatus && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                  isNotPublished && processingStatus === 'success' ? 'bg-gray-200 text-gray-600' :
                  processingStatus === 'success' ? 'bg-green-100 text-green-700' :
                  processingStatus === 'warning' ? 'bg-amber-100 text-amber-700' :
                  processingStatus === 'error' ? 'bg-red-100 text-red-700' :
                  processingStatus === 'scraping' || processingStatus === 'saving' ? 'bg-blue-100 text-blue-700' :
                  processingStatus === 'review' ? 'bg-purple-100 text-purple-700' :
                  processingStatus === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {isNotPublished && processingStatus === 'success' ? 'Not Published' :
                   processingStatus === 'success' ? 'Success' :
                   processingStatus === 'warning' ? 'Warning' :
                   processingStatus === 'error' ? 'Error' :
                   processingStatus === 'scraping' ? 'Scraping' :
                   processingStatus === 'saving' ? 'Saving' :
                   processingStatus === 'review' ? 'Review' :
                   processingStatus === 'skipped' ? 'Skipped' :
                   'Pending'}
                </span>
              )}
            </div>
            
            {/* Right: Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Data source badge */}
              {dataSource && <DataSourceBadge source={dataSource} />}
              
              {/* Database status */}
              {game.saveResult && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 border border-green-200">
                  <Database className="h-3 w-3" />Saved
                </span>
              )}
              {!game.saveResult && game.existingGameId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 border border-blue-200">
                  <Database className="h-3 w-3" />Exists
                </span>
              )}

              {/* View details button */}
              {showActions && onViewDetails && data && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}

              {/* Save button */}
              {showActions && onSave && processingStatus !== 'saving' && data && 
               (!hasDoNotScrape || data?.gameStatus === 'NOT_PUBLISHED') && !game.saveResult && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSave(); }}
                  disabled={!selectedVenueId && !enableCreateVenue}
                  className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={data?.gameStatus === 'NOT_PUBLISHED' ? 'Save as placeholder' : 'Save to database'}
                >
                  <Save className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          
          {/* Row 2: Game Info (DateTime, Name, Status Message) */}
          <div className="mt-1.5 ml-7 text-sm">
            {/* Success/Warning state - show game details */}
            {(processingStatus === 'success' || processingStatus === 'warning') && data && (
              <div className="flex flex-col gap-0.5">
                {/* Date/Time, Game Status on left - Buy-in on right */}
                <div className="flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-2 flex-wrap">
                    {formattedDateTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formattedDateTime}</span>
                      </span>
                    )}
                    {data.gameStatus && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-700' :
                        data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                        data.gameStatus === 'FINISHED' ? 'bg-gray-200 text-gray-700' :
                        data.gameStatus === 'NOT_PUBLISHED' ? 'bg-gray-200 text-gray-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {data.gameStatus}
                      </span>
                    )}
                  </div>
                  {/* Buy-in amount fixed on right */}
                  {data.buyIn != null && data.buyIn > 0 && (
                    <span className="text-gray-700 font-medium flex items-center gap-0.5 ml-2">
                      <DollarSign className="h-3.5 w-3.5" />
                      {data.buyIn}
                    </span>
                  )}
                </div>
                
                {/* Tournament name */}
                {data.name && (
                  <div className="text-gray-700 truncate font-medium">
                    {data.name}
                  </div>
                )}
                
                {/* Warning message */}
                {processingStatus === 'warning' && processingMessage && (
                  <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                    <div className="flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{processingMessage}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Non-success states - show processing message */}
            {processingStatus !== 'success' && processingStatus !== 'warning' && processingMessage && (
              <p className="text-gray-500 truncate">
                {processingMessage}
              </p>
            )}
            
            {/* Pending state with no message */}
            {processingStatus === 'pending' && !processingMessage && (
              <p className="text-gray-400">
                Waiting to process...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===================================================================
  // FULL MODE (Expanded View)
  // ===================================================================
  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${getListItemColorClass(data?.gameStatus, data?.registrationStatus)} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-3 sm:p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">
              {data?.name || `Tournament ${getDisplayId(game.id)}`}
            </h3>
            {dataSource && <DataSourceBadge source={dataSource} />}
            {game.saveResult && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">
                <Database className="h-3 w-3" />Saved
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2 mt-1">
            {data?.gameStatus && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-800' :
                data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                data.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                {data.gameStatus}
              </span>
            )}
            {data?.registrationStatus && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                data.registrationStatus === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                REG: {data.registrationStatus}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2">
          {showActions && (
            <>
              {onRefresh && (
                <button onClick={(e) => { e.stopPropagation(); onRefresh(); }} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
              {onViewDetails && data && (
                <button onClick={(e) => { e.stopPropagation(); onViewDetails(); }} className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <Eye className="h-4 w-4" />
                </button>
              )}
              {onSave && data && !game.saveResult && (
                <button onClick={(e) => { e.stopPropagation(); onSave(); }} disabled={!selectedVenueId} className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50">
                  <Save className="h-4 w-4" />
                </button>
              )}
              {onRemove && (
                <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded">
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded">
            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tournament Details */}
      {data && (
        <div className="px-3 sm:px-4 pb-3 flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
          {data.gameStartDateTime && (
            <div className="flex items-center">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {new Date(data.gameStartDateTime).toLocaleDateString()} {new Date(data.gameStartDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
          )}
          {data.buyIn != null && (
            <div className="flex items-center">
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />${data.buyIn}
            </div>
          )}
          {data.totalUniquePlayers != null && (
            <div className="flex items-center">
              <Users className="h-3.5 w-3.5 mr-1.5" />{data.totalUniquePlayers}
            </div>
          )}
          {countdown && (
            <div className="flex items-center text-blue-600 font-medium">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-pulse" />{countdown}
            </div>
          )}
        </div>
      )}

      {/* Error/Warning Messages */}
      {hasError && (
        <div className="px-3 sm:px-4 pb-3">
          <p className="text-xs sm:text-sm text-red-600 break-words">Error: {game.errorMessage}</p>
        </div>
      )}
      {hasDoNotScrape && (
        <div className="px-3 sm:px-4 pb-3">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="font-medium">Do Not Scrape flag active</span>
          </div>
        </div>
      )}

      {/* Expandable Section */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-3 sm:p-4 space-y-3 bg-white bg-opacity-50">
          {showVenueSelector && (
            <div className={`space-y-2 ${needsVenueSelection ? 'p-3 bg-yellow-50 border border-yellow-200 rounded-lg' : ''}`}>
              <label className={`block text-sm font-medium ${needsVenueSelection ? 'text-yellow-800' : 'text-gray-700'}`}>
                {needsVenueSelection ? '⚠️ Select Venue (Required)' : 'Select Venue'}
              </label>
              {venuesLoading ? (
                <div className="text-sm text-gray-500">Loading venues...</div>
              ) : (
                <select
                  value={selectedVenueId || ''}
                  onChange={(e) => onVenueChange?.(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${needsVenueSelection ? 'border-yellow-400 bg-white' : 'border-gray-300'}`}
                  disabled={game.jobStatus === 'SAVING'}
                >
                  <option value="">{venues.length === 0 ? 'No venues available' : 'Select Venue...'}</option>
                  {venues.map(venue => (
                    <option key={venue.id} value={venue.id}>{formatVenueOption(venue)}</option>
                  ))}
                  {enableCreateVenue && (
                    <>
                      <option disabled>──────────</option>
                      <option value="create_new" className="font-semibold">➕ Create new venue...</option>
                    </>
                  )}
                </select>
              )}
            </div>
          )}

          {game.lastFetched && (
            <div className="text-xs text-gray-500">
              <p>Last fetched: {new Date(game.lastFetched).toLocaleString()}</p>
              {game.fetchCount && <p>Total fetches: {game.fetchCount}</p>}
            </div>
          )}

          {game.saveResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">✓ Successfully saved to database</p>
              <p className="text-xs text-green-700 mt-1">Database ID: {game.saveResult.id}</p>
            </div>
          )}

          {game.existingGameId && !game.saveResult && (
            <div className="text-xs text-gray-500">
              <p>Database ID: {game.existingGameId}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GameListItem;