// src/components/scraper/admin/ErrorHandlingModal.tsx
// Modal for handling errors during scraping process

import React from 'react';
import { 
  RefreshCw, Pause, XCircle, AlertTriangle, Eye, StopCircle 
} from 'lucide-react';
import { ErrorType, ErrorDecision } from '../../../types/scraper';
import { getErrorDescription, getErrorColorScheme } from '../../../utils/scraperErrorUtils';

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
  consecutiveNotFound: number;
  remainingInQueue: number;
  onDecision: (decision: ErrorDecision) => void;
}

export const ErrorHandlingModal: React.FC<ErrorHandlingModalProps> = ({
  isOpen,
  tournamentId,
  url,
  errorType,
  errorMessage,
  canRetry,
  consecutiveErrors,
  totalErrors,
  consecutiveBlanks,
  consecutiveNotFound,
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
              <>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500 block text-xs">Consecutive Blanks</span>
                  <span className={`font-semibold ${consecutiveBlanks >= 3 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {consecutiveBlanks}
                  </span>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500 block text-xs">Consecutive NOT_FOUND</span>
                  <span className={`font-semibold ${consecutiveNotFound >= 10 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {consecutiveNotFound}
                  </span>
                </div>
              </>
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

          {errorType === 'NOT_FOUND' && consecutiveNotFound >= 10 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
              <Eye className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Multiple consecutive NOT_FOUND tournaments ({consecutiveNotFound}). You may have reached the end of published tournaments.
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

export default ErrorHandlingModal;
