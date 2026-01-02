// src/components/scraper/admin/BatchJobProgress.tsx
// ==========================================
// Enhanced batch job progress display with real-time streaming
//
// REFACTORED v2.0: Subscription-based updates
// - Removed rate limit indicators (no longer relevant)
// - Added subscription status indicator
// - Simplified polling indicator to show subscription state
// - Real-time game streaming via useBatchGameStream
// - Real-time job progress via useBatchJobMonitor (now subscription-based)
// ==========================================

import React, { useMemo, useState } from 'react';
import { 
  Clock, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Zap,
  TrendingUp,
  Activity,
  X,
  ChevronDown,
  ChevronUp,
  Radio,
  Square,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ScraperJob } from '../../../API';
import { 
  useBatchJobMonitor, 
  getJobStatusLabel, 
  getJobStatusColor
} from '../../../hooks/scraper/useBatchJobMonitor';
import { useBatchGameStream } from '../../../hooks/scraper/useBatchGameStream';
import GameListItem from '../GameListItem';

// ===================================================================
// TYPES
// ===================================================================

interface BatchJobProgressProps {
  jobId: string | null;
  entityId?: string;
  onClear?: () => void;
  onComplete?: (job: ScraperJob) => void;
  onStop?: () => void;
  showDetailedStats?: boolean;
  showStreamingGames?: boolean;
  compact?: boolean;
  maxStreamedGames?: number;
}

interface StatCardProps {
  label: string;
  value: number | string;
  colorClass?: string;
  icon?: React.ReactNode;
  pulse?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  clickable?: boolean;
  title?: string;
}

// ===================================================================
// ERRORS MODAL COMPONENT
// ===================================================================

interface ErrorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: string[];
  jobId: string;
}

const ErrorsModal: React.FC<ErrorsModalProps> = ({ isOpen, onClose, errors, jobId }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-red-50">
            <h3 className="text-lg font-medium text-red-900">
              Errors ({errors.length}) - Job {jobId.slice(0, 8)}...
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Error List */}
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {errors.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No error details available</p>
            ) : (
              <ul className="space-y-2">
                {errors.map((error, idx) => (
                  <li 
                    key={idx}
                    className="p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-800 flex items-start gap-2"
                  >
                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" />
                    <span className="font-mono text-xs break-all">{error}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// STAT CARD COMPONENT
// ===================================================================

const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  colorClass = 'bg-gray-50',
  icon,
  pulse = false,
  highlight = false,
  onClick,
  clickable = false,
  title,
}) => (
  <div 
    onClick={onClick}
    title={title}
    className={`
      rounded-lg p-3 transition-all duration-300
      ${colorClass}
      ${highlight ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
      ${pulse ? 'animate-pulse' : ''}
      ${clickable ? 'cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-gray-300' : ''}
    `}
  >
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      {icon}
    </div>
    <div className={`
      font-bold text-xl mt-1 tabular-nums
      ${highlight ? 'text-blue-600' : ''}
    `}>
      {value}
    </div>
  </div>
);

// ===================================================================
// ACTIVITY INDICATOR
// ===================================================================

const ActivityIndicator: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  if (!isActive) return null;
  
  return (
    <div className="flex items-center gap-2 text-blue-600">
      <div className="relative">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="absolute inset-0 animate-ping opacity-75">
          <Loader2 className="h-4 w-4" />
        </span>
      </div>
      <span className="text-sm font-medium animate-pulse">Processing...</span>
    </div>
  );
};

// ===================================================================
// PROGRESS BAR
// ===================================================================

const ProgressBar: React.FC<{ 
  current: number; 
  total: number | null;
  isActive: boolean;
}> = ({ current, total, isActive }) => {
  if (!total || total <= 0) return null;
  
  const percentage = Math.min(100, Math.round((current / total) * 100));
  
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Progress</span>
        <span>{current} / {total} ({percentage}%)</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`
            h-full rounded-full transition-all duration-500 ease-out
            ${isActive ? 'bg-blue-500' : 'bg-green-500'}
          `}
          style={{ width: `${percentage}%` }}
        >
          {isActive && (
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// SUBSCRIPTION STATUS INDICATOR
// ===================================================================

interface SubscriptionIndicatorProps {
  isJobSubscribed: boolean;
  isGameStreamSubscribed: boolean;
  showGameStream: boolean;
}

const SubscriptionIndicator: React.FC<SubscriptionIndicatorProps> = ({
  isJobSubscribed,
  isGameStreamSubscribed,
  showGameStream,
}) => {
  const bothConnected = isJobSubscribed && (!showGameStream || isGameStreamSubscribed);
  const anyConnected = isJobSubscribed || isGameStreamSubscribed;
  
  if (bothConnected) {
    return (
      <span 
        className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full"
        title="Real-time updates active"
      >
        <Wifi className="h-3 w-3" />
        Live
      </span>
    );
  }
  
  if (anyConnected) {
    return (
      <span 
        className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full"
        title="Partial connection - some real-time updates active"
      >
        <Wifi className="h-3 w-3" />
        Partial
      </span>
    );
  }
  
  return (
    <span 
      className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full"
      title="Connecting to real-time updates..."
    >
      <WifiOff className="h-3 w-3" />
      Connecting
    </span>
  );
};

// ===================================================================
// STREAMING GAMES LIST
// ===================================================================

interface StreamingGamesListProps {
  games: ReturnType<typeof useBatchGameStream>['games'];
  isSubscribed: boolean;
  isJobActive: boolean;
  onClear: () => void;
}

const StreamingGamesList: React.FC<StreamingGamesListProps> = ({
  games,
  isSubscribed,
  isJobActive,
  onClear,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (games.length === 0 && !isSubscribed) return null;

  return (
    <div className="border-t border-gray-100">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 cursor-pointer select-none focus:outline-none focus:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-700">
            Live Results ({games.length})
          </span>
          {isSubscribed && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Radio className="h-3 w-3" />
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {games.length > 0 && !isJobActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Clear
            </button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>
      
      {/* Games List */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {games.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              {isSubscribed ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Waiting for results...</span>
                </div>
              ) : (
                <span>No games processed yet</span>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {games.map((game, index) => (
                <div 
                  key={game.id} 
                  className={`
                    transition-all duration-300
                    ${index === 0 && isJobActive ? 'ring-2 ring-blue-300 ring-opacity-50 rounded-lg' : ''}
                  `}
                >
                  <GameListItem
                    game={game}
                    compact={true}
                    showVenueSelector={false}
                    showActions={false}
                    dataSource={game.dataSource}
                    processingStatus={
                      game.saveResult?.action === 'CREATED' ? 'success' :
                      game.saveResult?.action === 'UPDATED' ? 'success' :
                      game.errorMessage ? 'error' :
                      'skipped'
                    }
                    processingMessage={
                      game.saveResult?.action === 'CREATED' ? `Created: ${game.saveResult.gameId?.slice(0, 8)}` :
                      game.saveResult?.action === 'UPDATED' ? `Updated: ${game.saveResult.gameId?.slice(0, 8)}` :
                      game.errorMessage || 'Skipped'
                    }
                    tournamentId={game.data?.tournamentId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const BatchJobProgress: React.FC<BatchJobProgressProps> = ({
  jobId,
  onClear,
  onComplete,
  onStop,
  showDetailedStats = true,
  showStreamingGames = false,
  compact = false,
  maxStreamedGames = 50,
}) => {
  const [showErrorsModal, setShowErrorsModal] = useState(false);

  // Use the monitoring hook for job status (now subscription-based)
  const {
    job,
    stats,
    liveDuration,
    isActive,
    isComplete,
    isPolling,
    isSubscribed: isJobSubscribed,
    hasChanges,
    refresh,
    formatDuration,
    error,
  } = useBatchJobMonitor(jobId, {
    onJobComplete: onComplete,
  });

  // Use the streaming hook for real-time game events
  const {
    games: streamedGames,
    isSubscribed: isGameStreamSubscribed,
    clear: clearStream,
  } = useBatchGameStream(
    showStreamingGames ? jobId : null,
    {
      maxGames: maxStreamedGames,
      onGameReceived: (event) => {
        console.log(`[BatchJobProgress] Game processed: ${event.tournamentId} - ${event.action}`);
      },
    }
  );

  // Calculate success rate locally if not provided
  const calculatedSuccessRate = useMemo(() => {
    if (stats.successRate !== null) return stats.successRate;
    const total = stats.newGames + stats.updated + stats.errors + stats.skipped;
    if (total === 0) return null;
    return ((stats.newGames + stats.updated) / total) * 100;
  }, [stats]);

  // Determine total for progress bar
  const progressTotal = useMemo(() => {
    if (job?.startId && job?.endId) {
      return job.endId - job.startId + 1;
    }
    if (job?.maxGames) {
      return job.maxGames;
    }
    return null;
  }, [job]);

  // Parse error messages from job
  const errorMessages = useMemo((): string[] => {
    if (!job) return [];
    
    if (job.errorMessages && Array.isArray(job.errorMessages)) {
      return job.errorMessages.filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
    }
    
    if (stats.errors > 0) {
      return [`${stats.errors} error(s) occurred during batch processing. Check CloudWatch logs for details.`];
    }
    
    return [];
  }, [job, stats.errors]);

  // Don't render if no job
  if (!jobId || !job) {
    return null;
  }

  const statusLabel = getJobStatusLabel(job.status);
  const statusColor = getJobStatusColor(job.status);

  return (
    <>
      <div className={`
        bg-white border rounded-lg shadow-sm overflow-hidden
        ${isActive ? 'border-blue-200' : 'border-gray-200'}
        transition-colors duration-300
      `}>
        {/* Header */}
        <div className={`
          px-4 py-3 border-b flex items-center justify-between
          ${isActive ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-100'}
        `}>
          <div className="flex items-center gap-3">
            {isActive ? (
              <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
            ) : isComplete && stats.errors === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : isComplete && stats.errors > 0 ? (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            ) : (
              <Clock className="h-5 w-5 text-gray-400" />
            )}
            
            <div>
              <h3 className="font-medium text-gray-900">
                Batch Job: {(job.jobId || job.id || '').slice(0, 8)}...
              </h3>
              {job.startId && job.endId && (
                <p className="text-xs text-gray-500">
                  Range: {job.startId} → {job.endId}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Subscription status indicator */}
            <SubscriptionIndicator
              isJobSubscribed={isJobSubscribed}
              isGameStreamSubscribed={isGameStreamSubscribed}
              showGameStream={showStreamingGames}
            />
            
            {/* Activity indicator */}
            <ActivityIndicator isActive={isActive} />
            
            {/* Status badge */}
            <span className={`
              px-3 py-1 text-xs font-medium rounded-full
              ${statusColor}
              ${isActive ? 'animate-pulse' : ''}
            `}>
              {statusLabel}
            </span>
            
            {/* Stop button - only shown when job is active */}
            {isActive && onStop && (
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                title="Stop batch job"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
            )}
            
            {/* Refresh button */}
            <button
              onClick={refresh}
              disabled={isPolling}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${isPolling ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Connection error banner */}
        {error && !isJobSubscribed && (
          <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700 flex items-center gap-2">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span>Connection issue: {error}. Using cached data.</span>
          </div>
        )}

        {/* Progress bar */}
        {progressTotal && (
          <div className="px-4 py-2 bg-gray-50/50">
            <ProgressBar 
              current={stats.processed} 
              total={progressTotal}
              isActive={isActive}
            />
          </div>
        )}

        {/* Stats grid */}
        <div className={`p-4 ${compact ? 'grid-cols-4' : 'grid-cols-2 md:grid-cols-4'} grid gap-3`}>
          <StatCard
            label="Processed"
            value={stats.processed}
            colorClass="bg-gray-50"
            highlight={hasChanges && stats.processed > 0}
            icon={isActive && stats.processed > 0 ? (
              <TrendingUp className="h-3 w-3 text-gray-400" />
            ) : undefined}
          />
          
          <StatCard
            label="New Games"
            value={stats.newGames}
            colorClass="bg-green-50"
            highlight={hasChanges && stats.newGames > 0}
            icon={stats.newGames > 0 ? (
              <Zap className="h-3 w-3 text-green-500" />
            ) : undefined}
          />
          
          <StatCard
            label="Updated"
            value={stats.updated}
            colorClass="bg-blue-50"
            highlight={hasChanges && stats.updated > 0}
          />
          
          <StatCard
            label="Errors"
            value={stats.errors}
            colorClass={stats.errors > 0 ? 'bg-red-50' : 'bg-gray-50'}
            icon={stats.errors > 0 ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : undefined}
            clickable={stats.errors > 0}
            onClick={stats.errors > 0 ? () => setShowErrorsModal(true) : undefined}
            title={stats.errors > 0 ? 'Click to view error details' : undefined}
          />

          {showDetailedStats && (
            <>
              <StatCard
                label="Skipped"
                value={stats.skipped}
                colorClass="bg-yellow-50"
              />
              
              <StatCard
                label="Blanks"
                value={stats.blanks}
                colorClass="bg-gray-50"
              />
              
              <StatCard
                label="Duration"
                value={formatDuration(liveDuration)}
                colorClass="bg-gray-50"
                pulse={isActive}
                icon={isActive ? (
                  <Clock className="h-3 w-3 text-blue-500 animate-pulse" />
                ) : undefined}
              />
              
              <StatCard
                label="Success Rate"
                value={calculatedSuccessRate !== null ? `${calculatedSuccessRate.toFixed(1)}%` : '-'}
                colorClass={
                  calculatedSuccessRate === null ? 'bg-gray-50' :
                  calculatedSuccessRate >= 80 ? 'bg-green-50' :
                  calculatedSuccessRate >= 50 ? 'bg-yellow-50' :
                  'bg-red-50'
                }
              />
            </>
          )}
        </div>

        {/* Streamed Games List */}
        {showStreamingGames && !compact && (
          <StreamingGamesList
            games={streamedGames}
            isSubscribed={isGameStreamSubscribed}
            isJobActive={isActive}
            onClear={clearStream}
          />
        )}

        {/* Footer actions */}
        {!isActive && onClear && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <button
              onClick={onClear}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear job status
            </button>
            {stats.errors > 0 && (
              <button
                onClick={() => setShowErrorsModal(true)}
                className="text-sm text-red-600 hover:text-red-700 transition-colors flex items-center gap-1"
              >
                <XCircle className="h-3.5 w-3.5" />
                View {stats.errors} error{stats.errors !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Errors Modal */}
      <ErrorsModal
        isOpen={showErrorsModal}
        onClose={() => setShowErrorsModal(false)}
        errors={errorMessages}
        jobId={job.jobId || job.id || ''}
      />
    </>
  );
};

// ===================================================================
// COMPACT VERSION
// ===================================================================

export const BatchJobProgressCompact: React.FC<Omit<BatchJobProgressProps, 'showDetailedStats' | 'compact'>> = (props) => (
  <BatchJobProgress {...props} showDetailedStats={false} compact={true} />
);

export default BatchJobProgress;