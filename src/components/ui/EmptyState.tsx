// src/components/ui/EmptyState.tsx
import React from 'react';
import { FolderOpenIcon } from '@heroicons/react/24/outline';

interface EmptyStateProps {
  /** Main message */
  message: string;
  /** Optional description */
  description?: string;
  /** Optional icon (defaults to FolderOpenIcon) */
  icon?: React.ReactNode;
  /** Optional action button */
  action?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * EmptyState - Mobile-first empty state placeholder
 * 
 * Usage:
 * <EmptyState 
 *   message="No venues found"
 *   description="Try adjusting your filters"
 *   action={<button>Clear Filters</button>}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  description,
  icon,
  action,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: {
      wrapper: 'py-6 sm:py-8',
      icon: 'h-8 w-8 sm:h-10 sm:w-10',
      message: 'text-sm',
      description: 'text-xs',
    },
    md: {
      wrapper: 'py-8 sm:py-12',
      icon: 'h-10 w-10 sm:h-12 sm:w-12',
      message: 'text-sm sm:text-base',
      description: 'text-xs sm:text-sm',
    },
    lg: {
      wrapper: 'py-12 sm:py-16',
      icon: 'h-12 w-12 sm:h-16 sm:w-16',
      message: 'text-base sm:text-lg',
      description: 'text-sm',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`text-center ${classes.wrapper} ${className}`}>
      <div className="flex justify-center mb-3 sm:mb-4 text-gray-300">
        {icon || <FolderOpenIcon className={classes.icon} />}
      </div>
      <p className={`font-medium text-gray-500 ${classes.message}`}>
        {message}
      </p>
      {description && (
        <p className={`mt-1 text-gray-400 ${classes.description}`}>
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
