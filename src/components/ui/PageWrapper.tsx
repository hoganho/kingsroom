// src/components/layout/PageWrapper.tsx
import React from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * PageWrapper - Mobile-first page container
 * 
 * Provides consistent responsive layout:
 * - Mobile: Smaller padding
 * - Desktop: Larger padding with max-width constraint
 * 
 * Note: For page headers, use <PageHeader /> component separately
 * for better control and flexibility.
 * 
 * Usage:
 * <PageWrapper>
 *   <PageHeader title="Venues" onRefresh={handleRefresh} />
 *   <FilterBar>...</FilterBar>
 *   {content}
 * </PageWrapper>
 */
export const PageWrapper: React.FC<PageWrapperProps> = ({ 
  children, 
  maxWidth = '7xl',
  padding = 'md',
  className = '',
}) => {
  const maxWidthClasses = {
    'sm': 'max-w-sm',
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full',
  };

  const paddingClasses = {
    'none': '',
    'sm': 'px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6',
    'md': 'px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8',
    'lg': 'px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10',
  };

  return (
    <div 
      className={`
        mx-auto
        ${maxWidthClasses[maxWidth]}
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/**
 * PageCard - Card component for content sections
 */
export const PageCard: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}> = ({ children, className = '', padding = 'md' }) => {
  const paddingClasses = {
    'none': '',
    'sm': 'p-2 sm:p-3',
    'md': 'p-3 sm:p-4 lg:p-6',
    'lg': 'p-4 sm:p-6 lg:p-8',
  };

  return (
    <div 
      className={`
        bg-white rounded-lg shadow-sm border border-gray-200
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/**
 * PageGrid - Grid layout helper
 */
export const PageGrid: React.FC<{ 
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
}> = ({ children, columns = 1, gap = 'md' }) => {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  const gapClasses = {
    'sm': 'gap-3 sm:gap-4',
    'md': 'gap-4 sm:gap-6',
    'lg': 'gap-6 sm:gap-8',
  };

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]}`}>
      {children}
    </div>
  );
};

export default PageWrapper;
