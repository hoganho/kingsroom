// src/components/ui/ErrorAlert.tsx
import React from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ErrorAlertProps {
  /** Error message */
  message: string;
  /** Optional title */
  title?: string;
  /** Optional dismiss handler */
  onDismiss?: () => void;
  /** Variant */
  variant?: 'error' | 'warning' | 'info';
  /** Additional class names */
  className?: string;
}

/**
 * ErrorAlert - Mobile-first alert/error message component
 * 
 * Usage:
 * <ErrorAlert 
 *   message="Failed to load data" 
 *   onDismiss={() => setError(null)}
 * />
 */
export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  title,
  onDismiss,
  variant = 'error',
  className = '',
}) => {
  const variantClasses = {
    error: {
      wrapper: 'bg-red-50 border-red-200',
      icon: 'text-red-500',
      title: 'text-red-800',
      message: 'text-red-700',
      button: 'text-red-500 hover:text-red-700 focus:ring-red-500',
    },
    warning: {
      wrapper: 'bg-yellow-50 border-yellow-200',
      icon: 'text-yellow-500',
      title: 'text-yellow-800',
      message: 'text-yellow-700',
      button: 'text-yellow-500 hover:text-yellow-700 focus:ring-yellow-500',
    },
    info: {
      wrapper: 'bg-blue-50 border-blue-200',
      icon: 'text-blue-500',
      title: 'text-blue-800',
      message: 'text-blue-700',
      button: 'text-blue-500 hover:text-blue-700 focus:ring-blue-500',
    },
  };

  const classes = variantClasses[variant];

  return (
    <div 
      className={`
        rounded-lg border p-3 sm:p-4
        ${classes.wrapper}
        ${className}
      `}
      role="alert"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <ExclamationTriangleIcon 
          className={`h-5 w-5 flex-shrink-0 ${classes.icon}`} 
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={`text-sm font-medium ${classes.title}`}>
              {title}
            </h3>
          )}
          <p className={`text-xs sm:text-sm ${title ? 'mt-1' : ''} ${classes.message}`}>
            {message}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`
              flex-shrink-0 p-1 -m-1 rounded-full
              focus:outline-none focus:ring-2 focus:ring-offset-2
              ${classes.button}
            `}
            aria-label="Dismiss"
          >
            <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorAlert;
