// src/pages/games/game-tabs/components.tsx
// Shared utility components for GameDetails tabs
// =============================================================================

import React from 'react';
import {
  ArrowPathIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// =============================================================================
// STATUS BADGE
// =============================================================================

interface StatusBadgeProps {
  status: string;
  type?: 'game' | 'registration' | 'assignment';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'game' }) => {
  const getStatusColor = () => {
    if (type === 'game') {
      switch (status) {
        case 'RUNNING':
        case 'REGISTERING':
          return 'bg-green-100 text-green-800 border-green-200';
        case 'FINISHED':
          return 'bg-gray-100 text-gray-800 border-gray-200';
        case 'SCHEDULED':
          return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'CANCELLED':
          return 'bg-red-100 text-red-800 border-red-200';
        case 'CLOCK_STOPPED':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        default:
          return 'bg-gray-100 text-gray-700 border-gray-200';
      }
    }
    if (type === 'assignment') {
      switch (status) {
        case 'AUTO_ASSIGNED':
          return 'bg-green-100 text-green-800 border-green-200';
        case 'MANUALLY_ASSIGNED':
          return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'PENDING_ASSIGNMENT':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        default:
          return 'bg-gray-100 text-gray-700 border-gray-200';
      }
    }
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor()}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
};

// =============================================================================
// STAT CARD
// =============================================================================

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  iconColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  iconColor = 'text-gray-400' 
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <div className="flex items-start">
      <Icon className={`h-8 w-8 ${iconColor} flex-shrink-0`} />
      <div className="ml-3 min-w-0 flex-1">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-xl font-semibold text-gray-900 truncate">{value}</p>
        {subValue && <p className="text-xs text-gray-500 mt-0.5">{subValue}</p>}
      </div>
    </div>
  </div>
);

// =============================================================================
// DETAIL ROW
// =============================================================================

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export const DetailRow: React.FC<DetailRowProps> = ({ label, value, className = '' }) => (
  <div className={`py-3 flex justify-between items-center ${className}`}>
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className="text-sm font-medium text-gray-900 text-right">{value ?? '-'}</dd>
  </div>
);

// =============================================================================
// SECTION CARD
// =============================================================================

interface SectionCardProps {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ 
  title, 
  icon: Icon, 
  children, 
  className = '', 
  headerAction 
}) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <div className="flex items-center">
        {Icon && <Icon className="h-5 w-5 text-gray-400 mr-2" />}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      {headerAction}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
  message: string;
  icon?: React.ElementType;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  message, 
  icon: Icon = InformationCircleIcon 
}) => (
  <div className="text-center py-8">
    <Icon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
    <p className="text-sm text-gray-500">{message}</p>
  </div>
);

// =============================================================================
// LOADING SPINNER
// =============================================================================

export const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center h-64">
    <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
  </div>
);