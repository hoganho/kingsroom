// src/components/ui/SectionHeader.tsx
import React from 'react';

interface SectionHeaderProps {
  title: string;
  /** Optional action button/link */
  action?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * SectionHeader - Mobile-first section header with optional action
 * 
 * Usage:
 * <SectionHeader 
 *   title="Venues" 
 *   action={<button>View All</button>}
 * />
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  action,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-xs sm:text-sm',
    lg: 'text-sm sm:text-base',
  };

  return (
    <div className={`flex items-center justify-between gap-2 mb-2 sm:mb-3 ${className}`}>
      <h2 
        className={`
          font-semibold uppercase tracking-wide text-gray-500
          ${sizeClasses[size]}
        `}
      >
        {title}
      </h2>
      {action && (
        <div className="flex-shrink-0">{action}</div>
      )}
    </div>
  );
};

export default SectionHeader;
