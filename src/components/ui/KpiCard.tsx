// src/components/ui/KpiCard.tsx
// Tremor-style KPI card - adapted from Dashboard template patterns
import React from 'react';
import { cx } from '../../lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  /** Optional previous value for comparison */
  previousValue?: string | number;
  /** Optional change percentage */
  change?: number;
  /** Change type for styling */
  changeType?: 'positive' | 'negative' | 'neutral';
  /** Optional subtitle/description */
  subtitle?: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * KpiCard - Tremor Dashboard-style KPI card
 * 
 * Mobile-first design with:
 * - Compact padding on mobile
 * - Responsive typography
 * - Optional trend indicator
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  previousValue,
  change,
  changeType = 'neutral',
  subtitle,
  icon,
  onClick,
  className,
}) => {
  const changeColorClass = {
    positive: 'text-emerald-600 dark:text-emerald-500',
    negative: 'text-red-600 dark:text-red-500',
    neutral: 'text-gray-500 dark:text-gray-400',
  }[changeType];

  const changeBgClass = {
    positive: 'bg-emerald-50 dark:bg-emerald-950',
    negative: 'bg-red-50 dark:bg-red-950',
    neutral: 'bg-gray-50 dark:bg-gray-900',
  }[changeType];

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={cx(
        // Base styles
        'relative rounded-lg border p-4 sm:p-5',
        // Colors
        'bg-white dark:bg-gray-950',
        'border-gray-200 dark:border-gray-800',
        // Interactive states
        onClick && 'cursor-pointer transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700',
        onClick && 'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950',
        onClick && 'text-left w-full',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Title */}
          <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {title}
          </p>
          
          {/* Value */}
          <p className="mt-1 text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-gray-50 truncate">
            {value}
          </p>
          
          {/* Change indicator */}
          {(change !== undefined || previousValue !== undefined) && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {change !== undefined && (
                <span
                  className={cx(
                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                    changeBgClass,
                    changeColorClass,
                  )}
                >
                  {changeType === 'positive' && '↑'}
                  {changeType === 'negative' && '↓'}
                  {Math.abs(change).toFixed(1)}%
                </span>
              )}
              {previousValue !== undefined && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  from {previousValue}
                </span>
              )}
            </div>
          )}
          
          {/* Subtitle */}
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
              {subtitle}
            </p>
          )}
        </div>
        
        {/* Icon */}
        {icon && (
          <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
            {icon}
          </div>
        )}
      </div>
    </Component>
  );
};

export default KpiCard;
