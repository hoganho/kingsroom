// src/components/scraper/GameListItem.tsx
// REDESIGNED: Clear pipeline phases (Retrieve → Parse → Save)
// Each phase shows: status, source/target, and outcome

import React, { useState, useEffect } from 'react';
import { 
  Save, Eye, RefreshCw, XCircle, AlertCircle, Clock, Users, DollarSign, 
  Database, CheckCircle, Loader2, AlertTriangle, ExternalLink,
  Download, FileText, Globe, HardDrive, Ban, SkipForward
} from 'lucide-react';
import type { GameState } from '../../types/game';
import type { Venue } from '../../API';
import { POLLING_INTERVAL } from '../../hooks/useGameTracker';

// ===================================================================
// TYPES
// ===================================================================

export type DataSourceType = 's3' | 'web' | 'none' | 'pending';
export type ProcessingStatusType = 'pending' | 'scraping' | 'saving' | 'success' | 'warning' | 'error' | 'skipped' | 'review';

/** Pipeline phase status */
export type PhaseStatus = 'pending' | 'in-progress' | 'success' | 'skipped' | 'error' | 'not-needed';

/** Retrieve phase details */
export interface RetrievePhase {
  status: PhaseStatus;
  /** Where we attempted to get data from: 's3' | 'web' | 'none' */
  source?: 's3' | 'web' | 'none';
  /** Human-readable description */
  message?: string;
}

/** Parse phase details */
export interface ParsePhase {
  status: PhaseStatus;
  /** Was parsing actually performed? */
  performed?: boolean;
  /** Human-readable description */
  message?: string;
}

/** Save phase details */
export interface SavePhase {
  status: PhaseStatus;
  /** Was a record saved/updated? */
  saved?: boolean;
  /** What type of save: 'create' | 'update' | 'placeholder' | 'none' */
  saveType?: 'create' | 'update' | 'placeholder' | 'none';
  /** Saved game ID if available */
  gameId?: string;
  /** Human-readable description */
  message?: string;
}

/** Complete pipeline state */
export interface PipelineState {
  retrieve: RetrievePhase;
  parse: ParsePhase;
  save: SavePhase;
}

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
    'CLOCK_STOPPED': 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
    'FINISHED': 'bg-gray-50 border-gray-200 hover:bg-gray-100',
  };
  return statusColors[gameStatus || ''] || 'bg-white border-gray-200 hover:bg-gray-50';
};

const getProcessingStatusStyles = (status: ProcessingStatusType, isNotPublished?: boolean): string => {
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

/** Derive pipeline state from processing result */
const derivePipelineState = (
  processingStatus?: ProcessingStatusType,
  processingMessage?: string,
  dataSource?: DataSourceType,
  parsedData?: any,
  saveResult?: any,
  existingGameId?: string
): PipelineState => {
  // Default state
  const pipeline: PipelineState = {
    retrieve: { status: 'pending' },
    parse: { status: 'pending' },
    save: { status: 'pending' },
  };

  // Handle based on processing status
  switch (processingStatus) {
    case 'pending':
      pipeline.retrieve = { status: 'pending', message: 'Waiting...' };
      pipeline.parse = { status: 'pending' };
      pipeline.save = { status: 'pending' };
      break;

    case 'scraping':
      pipeline.retrieve = { 
        status: 'in-progress', 
        source: dataSource === 's3' ? 's3' : 'web',
        message: dataSource === 's3' ? 'Checking S3 cache...' : 'Fetching from web...'
      };
      pipeline.parse = { status: 'pending' };
      pipeline.save = { status: 'pending' };
      break;

    case 'saving':
      pipeline.retrieve = { 
        status: 'success', 
        source: dataSource === 's3' ? 's3' : dataSource === 'web' ? 'web' : 'none',
        message: dataSource === 's3' ? 'From S3 cache' : dataSource === 'web' ? 'From live scrape' : 'Retrieved'
      };
      pipeline.parse = { status: 'success', performed: true, message: 'Parsed successfully' };
      pipeline.save = { status: 'in-progress', message: 'Saving to database...' };
      break;

    case 'review':
      pipeline.retrieve = { 
        status: 'success', 
        source: dataSource === 's3' ? 's3' : dataSource === 'web' ? 'web' : 'none',
        message: dataSource === 's3' ? 'From S3 cache' : 'From live scrape'
      };
      pipeline.parse = { status: 'success', performed: true, message: 'Parsed - awaiting review' };
      pipeline.save = { status: 'pending', message: 'Awaiting confirmation' };
      break;

    case 'success':
    case 'warning': {
      const isNotPublished = parsedData?.gameStatus === 'NOT_PUBLISHED';
      const isDoNotScrape = parsedData?.doNotScrape;
      const wasRetrievedFromS3 = dataSource === 's3' || parsedData?.s3Key;
      const wasRetrievedFromWeb = dataSource === 'web' && !parsedData?.s3Key;
      const wasNotRetrieved = dataSource === 'none' || (!wasRetrievedFromS3 && !wasRetrievedFromWeb && isDoNotScrape);
      
      // Retrieve phase
      if (wasNotRetrieved || (isDoNotScrape && !wasRetrievedFromS3 && !wasRetrievedFromWeb)) {
        pipeline.retrieve = { 
          status: 'skipped', 
          source: 'none',
          message: isDoNotScrape ? 'Do Not Scrape' : 'Not retrieved'
        };
      } else if (wasRetrievedFromS3) {
        pipeline.retrieve = { 
          status: 'success', 
          source: 's3',
          message: 'From S3 cache'
        };
      } else {
        pipeline.retrieve = { 
          status: 'success', 
          source: 'web',
          message: 'From live scrape'
        };
      }
      
      // Parse phase - skipped if we didn't retrieve OR if it's a placeholder
      if (wasNotRetrieved || isDoNotScrape || isNotPublished) {
        pipeline.parse = { 
          status: 'skipped', 
          performed: false, 
          message: isDoNotScrape ? 'Placeholder' : isNotPublished ? 'Not Published' : 'No data'
        };
      } else {
        pipeline.parse = { 
          status: processingStatus === 'warning' ? 'success' : 'success', 
          performed: true, 
          message: processingStatus === 'warning' ? 'Parsed (warnings)' : 'OK'
        };
      }
      
      // Save phase
      if (saveResult || existingGameId) {
        const isUpdate = saveResult?.action === 'UPDATE' || (existingGameId && !saveResult);
        const saveType = isNotPublished || isDoNotScrape ? 'placeholder' : isUpdate ? 'update' : 'create';
        pipeline.save = { 
          status: 'success', 
          saved: true,
          saveType,
          gameId: saveResult?.gameId || existingGameId,
          message: saveType === 'placeholder' 
            ? 'Placeholder saved' 
            : isUpdate 
            ? 'Updated' 
            : 'Created'
        };
      } else {
        // Scrape-only mode - no save attempted
        pipeline.save = { 
          status: 'not-needed', 
          saved: false,
          saveType: 'none',
          message: 'Scrape only'
        };
      }
      break;
    }

    case 'skipped': {
      const skipReason = processingMessage || 'Skipped';
      const isDoNotScrape = skipReason.toLowerCase().includes('do not scrape');
      const isNotFound = skipReason.toLowerCase().includes('not found') || skipReason.toLowerCase().includes('not_found');
      
      pipeline.retrieve = { 
        status: 'skipped', 
        source: 'none',
        message: isDoNotScrape ? 'Do Not Scrape' : isNotFound ? 'Not Found' : 'Skipped'
      };
      pipeline.parse = { 
        status: 'skipped', 
        performed: false, 
        message: 'N/A'
      };
      
      // Check if something was actually saved despite "skipped" status
      if (saveResult || existingGameId) {
        pipeline.save = { 
          status: 'success', 
          saved: true,
          saveType: 'placeholder',
          gameId: saveResult?.gameId || existingGameId,
          message: 'Placeholder saved'
        };
      } else {
        pipeline.save = { 
          status: 'skipped', 
          saved: false,
          saveType: 'none',
          message: 'Not saved'
        };
      }
      break;
    }

    case 'error': {
      const errorMsg = processingMessage || 'Error';
      const isFetchError = errorMsg.toLowerCase().includes('fetch') || 
                          errorMsg.toLowerCase().includes('timeout') ||
                          errorMsg.toLowerCase().includes('network') ||
                          errorMsg.toLowerCase().includes('404') ||
                          errorMsg.toLowerCase().includes('not found');
      const isSaveError = errorMsg.toLowerCase().includes('save');
      
      if (isSaveError) {
        pipeline.retrieve = { status: 'success', source: dataSource === 's3' ? 's3' : 'web', message: 'Retrieved' };
        pipeline.parse = { status: 'success', performed: true, message: 'Parsed' };
        pipeline.save = { status: 'error', saved: false, message: errorMsg };
      } else if (isFetchError) {
        pipeline.retrieve = { status: 'error', source: 'none', message: errorMsg };
        pipeline.parse = { status: 'not-needed', performed: false, message: 'N/A' };
        pipeline.save = { status: 'not-needed', saved: false, message: 'N/A' };
      } else {
        // Generic error - assume parse error
        pipeline.retrieve = { status: 'success', source: dataSource === 's3' ? 's3' : 'web', message: 'Retrieved' };
        pipeline.parse = { status: 'error', performed: false, message: errorMsg };
        pipeline.save = { status: 'not-needed', saved: false, message: 'N/A' };
      }
      break;
    }
  }

  return pipeline;
};

// ===================================================================
// PHASE BADGE COMPONENT
// ===================================================================

interface PhaseBadgeProps {
  phase: 'retrieve' | 'parse' | 'save';
  status: PhaseStatus;
  source?: string;
  message?: string;
  compact?: boolean;
}

const PhaseBadge: React.FC<PhaseBadgeProps> = ({ phase, status, source, message, compact = false }) => {
  // Icons for each phase
  const phaseIcons = {
    retrieve: { 
      s3: HardDrive, 
      web: Globe, 
      none: Ban,
      default: Download 
    },
    parse: FileText,
    save: Database,
  };

  // Status colors
  const statusStyles: Record<PhaseStatus, { bg: string; text: string; border: string; iconColor: string }> = {
    'pending': { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', iconColor: 'text-gray-400' },
    'in-progress': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', iconColor: 'text-blue-500' },
    'success': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', iconColor: 'text-green-500' },
    'skipped': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', iconColor: 'text-yellow-500' },
    'error': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', iconColor: 'text-red-500' },
    'not-needed': { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200', iconColor: 'text-gray-300' },
  };

  const style = statusStyles[status];
  
  // Get phase icon
  let PhaseIcon: typeof Download;
  if (phase === 'retrieve') {
    const icons = phaseIcons.retrieve;
    PhaseIcon = source === 's3' ? icons.s3 : source === 'web' ? icons.web : source === 'none' ? icons.none : icons.default;
  } else {
    PhaseIcon = phaseIcons[phase] as typeof Download;
  }

  // Phase labels (noun - what phase is this)
  const phaseLabels = {
    retrieve: 'Retrieve',
    parse: 'Parse',
    save: 'Save',
  };

  // Outcome labels (what happened - short)
  const getOutcomeLabel = (): string => {
    switch (phase) {
      case 'retrieve':
        switch (status) {
          case 'pending': return 'Waiting';
          case 'in-progress': return source === 's3' ? 'Checking S3' : 'Fetching';
          case 'success': return source === 's3' ? 'From S3' : 'Fetched';
          case 'skipped': return 'Skipped';
          case 'error': return 'Failed';
          case 'not-needed': return 'N/A';
        }
        break;
      case 'parse':
        switch (status) {
          case 'pending': return 'Waiting';
          case 'in-progress': return 'Parsing';
          case 'success': return 'OK';
          case 'skipped': return 'Skipped';
          case 'error': return 'Failed';
          case 'not-needed': return 'N/A';
        }
        break;
      case 'save':
        switch (status) {
          case 'pending': return 'Waiting';
          case 'in-progress': return 'Saving';
          case 'success': return 'Saved';
          case 'skipped': return 'Skipped';
          case 'error': return 'Failed';
          case 'not-needed': return 'Not saved';
        }
        break;
    }
    return '—';
  };

  const outcomeLabel = getOutcomeLabel();

  if (compact) {
    // Two-line compact badge: Phase name on top, outcome below
    return (
      <div 
        className={`inline-flex flex-col items-center px-2 py-1 rounded border ${style.bg} ${style.border} min-w-[70px]`}
        title={message || outcomeLabel}
      >
        {/* Phase name + icon */}
        <div className="flex items-center gap-1 text-gray-500 text-[10px] font-medium uppercase tracking-wide">
          <PhaseIcon className="h-3 w-3" />
          <span>{phaseLabels[phase]}</span>
        </div>
        {/* Outcome */}
        <div className={`flex items-center gap-0.5 text-xs font-semibold ${style.text}`}>
          {status === 'in-progress' && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === 'success' && <CheckCircle className={`h-3 w-3 ${style.iconColor}`} />}
          {status === 'error' && <XCircle className={`h-3 w-3 ${style.iconColor}`} />}
          {status === 'skipped' && <SkipForward className={`h-3 w-3 ${style.iconColor}`} />}
          <span>{outcomeLabel}</span>
        </div>
      </div>
    );
  }

  // Full size badge (for expanded view)
  return (
    <div className={`flex flex-col items-center p-2 rounded border ${style.bg} ${style.border} min-w-[80px]`}>
      <div className="flex items-center gap-1 mb-1 text-gray-500 text-[10px] font-medium uppercase tracking-wide">
        <PhaseIcon className="h-3.5 w-3.5" />
        <span>{phaseLabels[phase]}</span>
      </div>
      <div className={`flex items-center gap-1 text-sm font-semibold ${style.text}`}>
        {status === 'in-progress' && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === 'success' && <CheckCircle className={`h-4 w-4 ${style.iconColor}`} />}
        {status === 'error' && <XCircle className={`h-4 w-4 ${style.iconColor}`} />}
        {status === 'skipped' && <SkipForward className={`h-4 w-4 ${style.iconColor}`} />}
        <span>{outcomeLabel}</span>
      </div>
      {message && (
        <span className={`text-[10px] ${style.text} opacity-75 mt-0.5 text-center leading-tight`}>
          {message}
        </span>
      )}
    </div>
  );
};

// ===================================================================
// PIPELINE STATUS ROW (Compact inline version)
// ===================================================================

interface PipelineStatusRowProps {
  pipeline: PipelineState;
}

const PipelineStatusRow: React.FC<PipelineStatusRowProps> = ({ pipeline }) => {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <PhaseBadge 
        phase="retrieve" 
        status={pipeline.retrieve.status} 
        source={pipeline.retrieve.source}
        message={pipeline.retrieve.message}
        compact 
      />
      <span className="text-gray-300">→</span>
      <PhaseBadge 
        phase="parse" 
        status={pipeline.parse.status}
        message={pipeline.parse.message}
        compact 
      />
      <span className="text-gray-300">→</span>
      <PhaseBadge 
        phase="save" 
        status={pipeline.save.status}
        message={pipeline.save.message}
        compact 
      />
    </div>
  );
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
  // onRemove - kept for API compatibility but not used in this component
  onRemove: _onRemove,
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
  sourceUrl,
}) => {
  const [_countdown, setCountdown] = useState('');
  const needsVenueSelection = showVenueSelector && !selectedVenueId && !game.existingGameId && !game.saveResult;
  const [isExpanded, setIsExpanded] = useState(compact ? false : needsVenueSelection);

  const handleViewSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sourceUrl) return;
    const viewerUrl = `/scraper/view-source?url=${encodeURIComponent(sourceUrl)}`;
    window.open(viewerUrl, '_blank');
  };

  useEffect(() => {
    if (needsVenueSelection && !isExpanded && !compact) {
      setIsExpanded(true);
    }
  }, [needsVenueSelection, compact]);

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

  // Derive pipeline state
  const pipeline = derivePipelineState(
    processingStatus,
    processingMessage,
    dataSource,
    data,
    game.saveResult,
    game.existingGameId || undefined
  );

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
        <div className="p-3">
          {/* Row 1: ID + External Link + Overall Status + Actions */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Icon + ID + Link */}
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon className={`h-5 w-5 flex-shrink-0 ${getStatusIconColor(processingStatus || 'pending', isNotPublished)} ${isAnimating ? 'animate-spin' : ''}`} />
              
              <span className="text-base font-semibold text-gray-900">
                {tournamentId || getDisplayId(game.id)}
              </span>

              {sourceUrl && (
                <button 
                  onClick={handleViewSource}
                  className="text-gray-400 hover:text-blue-600 flex-shrink-0 focus:outline-none"
                  title="View cached HTML"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
              
              {/* Overall status badge */}
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
                  {isNotPublished && processingStatus === 'success' ? 'Placeholder' :
                   processingStatus === 'success' ? 'Complete' :
                   processingStatus === 'warning' ? 'Warning' :
                   processingStatus === 'error' ? 'Error' :
                   processingStatus === 'scraping' ? 'Retrieving' :
                   processingStatus === 'saving' ? 'Saving' :
                   processingStatus === 'review' ? 'Review' :
                   processingStatus === 'skipped' ? 'Skipped' :
                   'Pending'}
                </span>
              )}
            </div>
            
            {/* Right: Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {showActions && onViewDetails && data && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}

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
          
          {/* Row 2: Pipeline Status (Retrieve → Parse → Save) */}
          <div className="mt-2 ml-7">
            <PipelineStatusRow pipeline={pipeline} />
          </div>
          
          {/* Row 3: Game Info (only for success/warning states with data) */}
          {(processingStatus === 'success' || processingStatus === 'warning') && data && (
            <div className="mt-2 ml-7 text-sm">
              <div className="flex flex-col gap-0.5">
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
                        data.gameStatus === 'CLOCK_STOPPED' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {data.gameStatus}
                      </span>
                    )}
                  </div>
                  {data.buyIn != null && data.buyIn > 0 && (
                    <span className="text-gray-700 font-medium flex items-center gap-0.5 ml-2">
                      <DollarSign className="h-3.5 w-3.5" />
                      {data.buyIn}
                    </span>
                  )}
                </div>
                
                {data.name && (
                  <div className="text-gray-700 truncate font-medium">
                    {data.name}
                  </div>
                )}
                
                {processingStatus === 'warning' && processingMessage && (
                  <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                    <div className="flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{processingMessage}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Row 3 alternate: Error/Skip message */}
          {(processingStatus === 'error' || processingStatus === 'skipped') && processingMessage && (
            <div className="mt-2 ml-7">
              <p className={`text-sm ${processingStatus === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                {processingMessage}
              </p>
            </div>
          )}
          
          {/* Pending state */}
          {processingStatus === 'pending' && (
            <div className="mt-2 ml-7">
              <p className="text-sm text-gray-400">Waiting to process...</p>
            </div>
          )}
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
      <div className="p-4">
        <div className="flex items-start justify-between">
          {/* Left: Game Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-semibold text-gray-900">
                {tournamentId || getDisplayId(game.id)}
              </span>
              {sourceUrl && (
                <button 
                  onClick={handleViewSource}
                  className="text-gray-400 hover:text-blue-600"
                  title="View cached HTML"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
            </div>
            
            {data?.name && (
              <h3 className="text-base font-medium text-gray-800 truncate">
                {data.name}
              </h3>
            )}
            
            {/* Game details row */}
            {data && (
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                {data.gameStartDateTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatGameDateTime(data.gameStartDateTime)}
                  </span>
                )}
                {data.buyIn != null && data.buyIn > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {data.buyIn}
                  </span>
                )}
                {data.totalEntries != null && data.totalEntries > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {data.totalEntries}
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Right: Status + Actions */}
          <div className="flex flex-col items-end gap-2">
            {data?.gameStatus && (
              <span className={`text-xs px-2 py-1 rounded font-medium ${
                data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-700' :
                data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                data.gameStatus === 'FINISHED' ? 'bg-gray-200 text-gray-700' :
                data.gameStatus === 'NOT_PUBLISHED' ? 'bg-gray-200 text-gray-600' :
                data.gameStatus === 'CLOCK_STOPPED' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {data.gameStatus}
              </span>
            )}
            
            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {onViewDetails && data && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              {onRefresh && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
              {onSave && data && !game.saveResult && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSave(); }}
                  disabled={!selectedVenueId && !enableCreateVenue}
                  className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                  title="Save"
                >
                  <Save className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Pipeline Status Section */}
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <PhaseBadge 
              phase="retrieve" 
              status={pipeline.retrieve.status} 
              source={pipeline.retrieve.source}
              message={pipeline.retrieve.message}
            />
            <div className="text-gray-300 text-xl">→</div>
            <PhaseBadge 
              phase="parse" 
              status={pipeline.parse.status}
              message={pipeline.parse.message}
            />
            <div className="text-gray-300 text-xl">→</div>
            <PhaseBadge 
              phase="save" 
              status={pipeline.save.status}
              message={pipeline.save.message}
            />
          </div>
        </div>
        
        {/* Venue selector (if needed) */}
        {showVenueSelector && !game.saveResult && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Venue:</label>
              <select
                value={selectedVenueId || ''}
                onChange={(e) => onVenueChange?.(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                disabled={venuesLoading}
              >
                <option value="">Select venue...</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>{formatVenueOption(v)}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {hasError && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{game.errorMessage}</span>
            </div>
          </div>
        )}
        
        {/* Do Not Scrape warning */}
        {hasDoNotScrape && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
            <div className="flex items-start gap-2">
              <Ban className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>This tournament is marked as "Do Not Scrape"</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameListItem;
