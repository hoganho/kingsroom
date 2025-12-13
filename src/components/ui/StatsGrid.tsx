// src/components/ui/StatsGrid.tsx
import React from 'react';

interface StatsGridProps {
  children: React.ReactNode;
  /** Number of columns on different breakpoints */
  columns?: {
    mobile?: 1 | 2;
    tablet?: 2 | 3 | 4;
    desktop?: 3 | 4 | 5 | 6;
  };
  /** Additional class names */
  className?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  /** Optional trend indicator */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** Optional click handler */
  onClick?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * StatsGrid - Mobile-first responsive grid for stat cards
 * 
 * Layout:
 * - Mobile: 2 columns by default (fits nicely on small screens)
 * - Tablet: 3 columns
 * - Desktop: Configurable (default 5)
 */
export const StatsGrid: React.FC<StatsGridProps> = ({ 
  children, 
  columns = { mobile: 2, tablet: 3, desktop: 5 },
  className = '' 
}) => {
  const mobileClass = columns.mobile === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const tabletClass = columns.tablet === 2 ? 'sm:grid-cols-2' 
    : columns.tablet === 3 ? 'sm:grid-cols-3' 
    : 'sm:grid-cols-4';
  const desktopClass = columns.desktop === 3 ? 'lg:grid-cols-3'
    : columns.desktop === 4 ? 'lg:grid-cols-4'
    : columns.desktop === 5 ? 'lg:grid-cols-5'
    : 'lg:grid-cols-6';

  return (
    <div 
      className={`
        grid gap-3 sm:gap-4
        ${mobileClass} ${tabletClass} ${desktopClass}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/**
 * StatCard - A single statistic card, mobile-optimized
 * 
 * Features:
 * - Compact on mobile, more spacious on desktop
 * - Optional icon (hidden on very small screens if needed)
 * - Optional trend indicator
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  onClick,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'p-2 sm:p-3',
    md: 'p-3 sm:p-4',
    lg: 'p-4 sm:p-5',
  };

  const valueSizeClasses = {
    sm: 'text-base sm:text-lg',
    md: 'text-lg sm:text-xl lg:text-2xl',
    lg: 'text-xl sm:text-2xl lg:text-3xl',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        bg-white rounded-lg border border-gray-200 shadow-sm
        ${sizeClasses[size]}
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2' : ''}
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className={`mt-1 font-bold text-gray-900 ${valueSizeClasses[size]}`}>
            {value}
          </p>
          {trend && (
            <p className={`mt-1 text-xs font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 text-gray-400 hidden xs:block sm:block">
            {icon}
          </div>
        )}
      </div>
    </Component>
  );
};

export default StatsGrid;
