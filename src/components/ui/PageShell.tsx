// src/components/layout/PageShell.tsx
// Tremor Dashboard-style page shell/layout
import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { cx } from '../../lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  /** Additional class names */
  className?: string;
}

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Refresh handler - shows refresh button if provided */
  onRefresh?: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Last updated timestamp */
  lastUpdated?: Date | null;
  /** Actions to render on the right */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

interface PageSectionProps {
  children: React.ReactNode;
  /** Section title */
  title?: string;
  /** Section subtitle */
  subtitle?: string;
  /** Actions to render on the right of the title */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Format date to AEST
 */
function formatAESTDateTime(date: Date): string {
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * PageShell - Main page container with responsive padding
 */
export const PageShell: React.FC<PageShellProps> = ({
  children,
  maxWidth = '7xl',
  className,
}) => {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div
      className={cx(
        'mx-auto w-full',
        'px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8',
        maxWidthClasses[maxWidth],
        className,
      )}
    >
      {children}
    </div>
  );
};

/**
 * PageHeader - Title area with optional refresh and actions
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onRefresh,
  isLoading = false,
  lastUpdated,
  actions,
  className,
}) => {
  return (
    <div
      className={cx(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        'pb-4 sm:pb-6',
        className,
      )}
    >
      {/* Left: Title and subtitle */}
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50 sm:text-xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right: Actions and refresh */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={cx(
              'inline-flex flex-col items-center gap-0.5',
              'p-2 -m-2 rounded-lg',
              'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
              'transition-colors',
            )}
            aria-label="Refresh data"
          >
            <ArrowPathIcon
              className={cx('h-5 w-5', isLoading && 'animate-spin')}
            />
            {lastUpdated && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {formatAESTDateTime(lastUpdated)}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * PageSection - A titled section within a page
 */
export const PageSection: React.FC<PageSectionProps> = ({
  children,
  title,
  subtitle,
  actions,
  className,
}) => {
  return (
    <section className={cx('py-4 sm:py-6', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
};

export default PageShell;
