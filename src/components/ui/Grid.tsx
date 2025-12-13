// src/components/ui/Grid.tsx
// Tremor Dashboard-style grid layouts
import React from 'react';
import { cx } from '../../lib/utils';

type GridColumns = 1 | 2 | 3 | 4 | 5 | 6;

interface GridProps {
  children: React.ReactNode;
  /** Number of columns at each breakpoint */
  cols?: {
    xs?: GridColumns;
    sm?: GridColumns;
    md?: GridColumns;
    lg?: GridColumns;
    xl?: GridColumns;
  };
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

interface CardProps {
  children: React.ReactNode;
  /** Click handler - makes the card interactive */
  onClick?: () => void;
  /** Remove default padding */
  noPadding?: boolean;
  /** Additional class names */
  className?: string;
}

interface CardTitleProps {
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

interface CardDescriptionProps {
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

const columnClasses: Record<GridColumns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const smColumnClasses: Record<GridColumns, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
};

const mdColumnClasses: Record<GridColumns, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

const lgColumnClasses: Record<GridColumns, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

const xlColumnClasses: Record<GridColumns, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
};

const gapClasses = {
  sm: 'gap-3',
  md: 'gap-4 sm:gap-6',
  lg: 'gap-6 sm:gap-8',
};

/**
 * Grid - Responsive grid layout
 * 
 * Example:
 * <Grid cols={{ xs: 1, sm: 2, lg: 3 }}>
 *   <Card>...</Card>
 *   <Card>...</Card>
 * </Grid>
 */
export const Grid: React.FC<GridProps> = ({
  children,
  cols = { xs: 1, sm: 2, lg: 3 },
  gap = 'md',
  className,
}) => {
  return (
    <div
      className={cx(
        'grid',
        gapClasses[gap],
        cols.xs && columnClasses[cols.xs],
        cols.sm && smColumnClasses[cols.sm],
        cols.md && mdColumnClasses[cols.md],
        cols.lg && lgColumnClasses[cols.lg],
        cols.xl && xlColumnClasses[cols.xl],
        className,
      )}
    >
      {children}
    </div>
  );
};

/**
 * Card - Tremor-style card component
 */
export const Card: React.FC<CardProps> & {
  Title: React.FC<CardTitleProps>;
  Description: React.FC<CardDescriptionProps>;
} = ({ children, onClick, noPadding = false, className }) => {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={cx(
        // Base styles
        'rounded-lg border',
        // Colors
        'bg-white dark:bg-gray-950',
        'border-gray-200 dark:border-gray-800',
        // Padding
        !noPadding && 'p-4 sm:p-5',
        // Interactive styles
        onClick && [
          'cursor-pointer text-left w-full',
          'transition-all duration-200',
          'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
          'dark:focus:ring-offset-gray-950',
        ],
        className,
      )}
    >
      {children}
    </Component>
  );
};

/**
 * Card.Title - Card title text
 */
const CardTitle: React.FC<CardTitleProps> = ({ children, className }) => {
  return (
    <h3
      className={cx(
        'text-sm font-semibold text-gray-900 dark:text-gray-50',
        className,
      )}
    >
      {children}
    </h3>
  );
};

/**
 * Card.Description - Card description/subtitle text
 */
const CardDescription: React.FC<CardDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <p
      className={cx(
        'text-xs text-gray-500 dark:text-gray-400',
        className,
      )}
    >
      {children}
    </p>
  );
};

Card.Title = CardTitle;
Card.Description = CardDescription;

export default Grid;
