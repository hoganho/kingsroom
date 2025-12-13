// src/components/layout/PageHeader.tsx
import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Show refresh button */
  onRefresh?: () => void;
  /** Loading state - spins the refresh icon */
  isLoading?: boolean;
  /** Last updated timestamp */
  lastUpdated?: Date | null;
  /** Additional actions to show on the right */
  actions?: React.ReactNode;
}

/**
 * Formats a date to AEST timezone string
 */
function formatAESTDateTime(date: Date): string {
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * PageHeader - Mobile-first page header with title, refresh, and actions
 * 
 * Layout:
 * - Mobile: Title on left, refresh on right (stacked with last updated below)
 * - Desktop: Same but with more spacing
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onRefresh,
  isLoading = false,
  lastUpdated,
  actions,
}) => {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      {/* Left: Title and subtitle */}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 truncate">{subtitle}</p>
        )}
      </div>

      {/* Right: Refresh button and/or actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex flex-col items-center p-2 -m-2 text-gray-500 hover:text-gray-700 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg"
            aria-label="Refresh data"
          >
            <ArrowPathIcon 
              className={`h-5 w-5 sm:h-6 sm:w-6 ${isLoading ? 'animate-spin' : ''}`} 
            />
            {lastUpdated && (
              <span className="mt-0.5 text-[9px] sm:text-[10px] text-gray-400 whitespace-nowrap leading-tight text-center">
                <span className="hidden sm:inline">Last updated: </span>
                <span className="sm:hidden">Updated </span>
                <br className="sm:hidden" />
                {formatAESTDateTime(lastUpdated)}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
