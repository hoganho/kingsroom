// src/components/scraper/admin/ProgressSummary.tsx
// Progress summary bar showing processing status

import React, { useState, useEffect } from 'react';
import { RefreshCw, Pause, CheckCircle, StopCircle } from 'lucide-react';
import { ProcessingResult, IdSelectionMode, ScrapeFlow } from '../../../types/scraper';

interface ProgressSummaryProps {
  results: ProcessingResult[];
  isProcessing: boolean;
  isPaused: boolean;
  mode: IdSelectionMode;
  flow: ScrapeFlow;
  consecutiveErrors: number;
  consecutiveBlanks: number;
  consecutiveNotFound: number;
  onStop: () => void;
  startTime: number | null;
  totalQueueSize?: number;  // NEW: For simplified view, track total separately
  simplifiedView?: boolean; // NEW: Whether using simplified display mode
}

export const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  results, 
  isProcessing, 
  isPaused, 
  mode, 
  flow, 
  consecutiveErrors, 
  consecutiveBlanks, 
  consecutiveNotFound,
  onStop, 
  startTime,
  totalQueueSize,
  simplifiedView = false
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Update elapsed time every second while processing
  useEffect(() => {
    if (!startTime) {
      return;
    }
    
    // Always calculate current elapsed time
    setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    
    // Only run interval while processing
    if (!isProcessing) {
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime, isProcessing]);
  
  // Format elapsed time as MM:SS or HH:MM:SS
  const formatElapsedTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate stats
  const completed = results.filter(r => ['success', 'error', 'skipped'].includes(r.status)).length;
  const successful = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const inProgress = results.find(r => ['scraping', 'saving', 'review'].includes(r.status));
  
  // Use totalQueueSize for progress if provided (for simplified view)
  const total = totalQueueSize || results.length;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;
  
  // For auto mode or continuous modes
  const isUnboundedMode = mode === 'auto';
  
  // Determine border color based on state
  const getBorderColor = () => {
    if (consecutiveErrors >= 3) return 'border-red-500';
    if (consecutiveNotFound >= 10) return 'border-amber-500';
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
              {consecutiveNotFound > 0 && (mode === 'auto' || mode === 'bulk' || mode === 'range') && (
                <span className="ml-2 text-amber-600 font-medium">
                  • {consecutiveNotFound} NOT_FOUND
                </span>
              )}
              {consecutiveBlanks > 0 && mode === 'auto' && consecutiveNotFound === 0 && (
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
            consecutiveNotFound >= 10 ? 'bg-amber-500' :
            consecutiveBlanks >= 3 ? 'bg-amber-500' : 'bg-blue-600'
          }`}
          style={{ width: isUnboundedMode ? '100%' : `${progressPercent}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">
          {isUnboundedMode 
            ? `${completed} processed` 
            : `${completed} / ${total} processed`
          }
          {isUnboundedMode && isProcessing && <span className="ml-1 text-blue-500">(continuous)</span>}
          {simplifiedView && !isUnboundedMode && <span className="ml-1 text-gray-400">(simplified view)</span>}
        </span>
        
        {/* Timer */}
        {startTime && (
          <span className="text-gray-500 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
            ⏱ {formatElapsedTime(elapsedTime)}
          </span>
        )}
        
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

export default ProgressSummary;
