// src/components/ui/ContentCard.tsx
import React from 'react';

interface CardGridProps {
  children: React.ReactNode;
  /** Number of columns on different breakpoints */
  columns?: {
    mobile?: 1 | 2;
    tablet?: 2 | 3;
    desktop?: 3 | 4;
  };
  /** Additional class names */
  className?: string;
}

interface ContentCardProps {
  children: React.ReactNode;
  /** Optional click handler - makes the card interactive */
  onClick?: () => void;
  /** Card padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

interface ContentCardHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional badge/tag */
  badge?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

interface ContentCardRowProps {
  label: string;
  value: string | number | React.ReactNode;
  /** Additional class names */
  className?: string;
}

interface ContentCardSectionProps {
  title?: string;
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * CardGrid - Mobile-first responsive grid for content cards
 */
export const CardGrid: React.FC<CardGridProps> = ({ 
  children, 
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  className = '' 
}) => {
  const mobileClass = columns.mobile === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const tabletClass = columns.tablet === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  const desktopClass = columns.desktop === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';

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
 * ContentCard - A flexible card component, mobile-optimized
 */
const ContentCardBase: React.FC<ContentCardProps> = ({
  children,
  onClick,
  padding = 'md',
  className = '',
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-2 sm:p-3',
    md: 'p-3 sm:p-4',
    lg: 'p-4 sm:p-6',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm
        ${paddingClasses[padding]}
        ${onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
};

/**
 * ContentCard.Header - Standard card header with title and optional subtitle
 */
export const ContentCardHeader: React.FC<ContentCardHeaderProps> = ({
  title,
  subtitle,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex items-start justify-between gap-2 mb-2 sm:mb-3 ${className}`}>
      <div className="min-w-0 flex-1">
        {subtitle && (
          <p className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
            {subtitle}
          </p>
        )}
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-50 truncate">
          {title}
        </h3>
      </div>
      {badge && (
        <div className="flex-shrink-0">{badge}</div>
      )}
    </div>
  );
};

/**
 * ContentCard.Row - A label/value row within a card
 */
export const ContentCardRow: React.FC<ContentCardRowProps> = ({
  label,
  value,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${className}`}>
      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{label}</span>
      <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-50 text-right">{value}</span>
    </div>
  );
};

/**
 * ContentCard.Section - A titled section within a card
 */
export const ContentCardSection: React.FC<ContentCardSectionProps> = ({
  title,
  children,
  className = '',
}) => {
  return (
    <div className={className}>
      {title && (
        <p className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
          {title}
        </p>
      )}
      {children}
    </div>
  );
};

// Create compound component with proper TypeScript typing
type ContentCardComponent = React.FC<ContentCardProps> & {
  Header: typeof ContentCardHeader;
  Row: typeof ContentCardRow;
  Section: typeof ContentCardSection;
};

// Attach sub-components using type assertion
const ContentCard = ContentCardBase as ContentCardComponent;
ContentCard.Header = ContentCardHeader;
ContentCard.Row = ContentCardRow;
ContentCard.Section = ContentCardSection;

export { ContentCard };
export default ContentCard;