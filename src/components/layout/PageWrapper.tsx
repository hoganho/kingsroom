// src/components/layout/PageWrapper.tsx
import React from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
}

/**
 * PageWrapper provides consistent responsive layout for all pages
 * - Mobile: Full width with small padding
 * - Desktop: Centered content with max-width constraint
 */
export const PageWrapper: React.FC<PageWrapperProps> = ({ 
  children, 
  title,
  actions,
  maxWidth = '7xl' 
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
    'full': 'max-w-full'
  };

  return (
    <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 ${maxWidthClasses[maxWidth]}`}>
      {(title || actions) && (
        <div className="mb-6 lg:mb-8">
          <div className="sm:flex sm:items-center sm:justify-between">
            {title && (
              <div className="sm:flex-auto">
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                  {title}
                </h1>
              </div>
            )}
            {actions && (
              <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * Card component for content sections within pages
 */
export const PageCard: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
  noPadding?: boolean;
}> = ({ children, className = '', noPadding = false }) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${noPadding ? '' : 'p-4 sm:p-6'} ${className}`}>
      {children}
    </div>
  );
};

/**
 * Grid layout helper for responsive card layouts
 */
export const PageGrid: React.FC<{ 
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
}> = ({ children, columns = 1, gap = 'md' }) => {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  };

  const gapClasses = {
    'sm': 'gap-4',
    'md': 'gap-6',
    'lg': 'gap-8'
  };

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]}`}>
      {children}
    </div>
  );
};