// src/components/layout/FilterBar.tsx
import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

interface FilterBarSectionProps {
  children: React.ReactNode;
  /** Position: 'left' stacks first on mobile, 'right' stacks second */
  position?: 'left' | 'right';
  /** Additional class names */
  className?: string;
}

/**
 * FilterBar - Mobile-first container for filter controls
 * 
 * Layout:
 * - Mobile: Stacks vertically (full width)
 * - Desktop: Horizontal with space-between
 * 
 * Usage:
 * <FilterBar>
 *   <FilterBar.Section position="left">
 *     <EntitySelector />
 *   </FilterBar.Section>
 *   <FilterBar.Section position="right">
 *     <TimeRangeToggle />
 *   </FilterBar.Section>
 * </FilterBar>
 */
export const FilterBar: React.FC<FilterBarProps> & {
  Section: React.FC<FilterBarSectionProps>;
} = ({ children, className = '' }) => {
  return (
    <div 
      className={`
        flex flex-col gap-3
        sm:flex-row sm:items-center sm:justify-between sm:gap-4
        mb-4 sm:mb-6
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/**
 * FilterBar.Section - A section within the filter bar
 */
const FilterBarSection: React.FC<FilterBarSectionProps> = ({ 
  children, 
  position = 'left',
  className = '' 
}) => {
  return (
    <div 
      className={`
        flex items-center gap-2 flex-wrap
        ${position === 'right' ? 'sm:justify-end' : 'sm:justify-start'}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

FilterBar.Section = FilterBarSection;

export default FilterBar;
