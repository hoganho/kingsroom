// src/components/ui/LoadingState.tsx
import React from 'react';

interface LoadingStateProps {
  /** Loading message */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * LoadingState - Mobile-first loading indicator
 * 
 * Usage:
 * <LoadingState message="Loading venues..." />
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: {
      wrapper: 'py-6 sm:py-8',
      spinner: 'h-6 w-6',
      message: 'text-xs sm:text-sm',
    },
    md: {
      wrapper: 'py-12 sm:py-16',
      spinner: 'h-8 w-8',
      message: 'text-sm',
    },
    lg: {
      wrapper: 'py-16 sm:py-20',
      spinner: 'h-10 w-10',
      message: 'text-sm sm:text-base',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`text-center ${classes.wrapper} ${className}`}>
      <div className="flex justify-center mb-3">
        <svg 
          className={`animate-spin text-indigo-600 ${classes.spinner}`} 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      <p className={`text-gray-400 ${classes.message}`}>
        {message}
      </p>
    </div>
  );
};

export default LoadingState;
