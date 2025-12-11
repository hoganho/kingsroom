// src/components/scraper/shared/StatusBadges.tsx
// Status badge components for scraper UI
// EXTRACTED FROM: ScraperAdminShared.tsx

import React from 'react';
import { 
  Clock, 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  AlertCircle,
  Pause,
  Database,
  Calendar,
  PlayCircle,
  Users,
  StopCircle,
  MinusCircle,
  HelpCircle,
  Globe,
  HardDrive,
  Ban,
  Loader2
} from 'lucide-react';

// No API imports needed - all status types accept string | null | undefined

// ===================================================================
// JOB STATUS BADGE
// ===================================================================

const JOB_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  'PENDING': { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-3 h-3" /> },
  'QUEUED': { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-3 h-3" /> },
  'RUNNING': { color: 'bg-blue-100 text-blue-800', icon: <Activity className="w-3 h-3 animate-pulse" /> },
  'COMPLETED': { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
  'FAILED': { color: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" /> },
  'CANCELLED': { color: 'bg-yellow-100 text-yellow-800', icon: <AlertTriangle className="w-3 h-3" /> },
  'TIMEOUT': { color: 'bg-orange-100 text-orange-800', icon: <AlertCircle className="w-3 h-3" /> }
};

export const JobStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  const statusKey = status || 'UNKNOWN';
  const config = JOB_STATUS_CONFIG[statusKey] || { color: 'bg-gray-100 text-gray-800', icon: null };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.icon}
      {status || 'Unknown'}
    </span>
  );
};

// ===================================================================
// URL STATUS BADGE
// ===================================================================

const URL_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  'ACTIVE': { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
  'INACTIVE': { color: 'bg-gray-100 text-gray-800', icon: <Pause className="w-3 h-3" /> },
  'DO_NOT_SCRAPE': { color: 'bg-yellow-100 text-yellow-800', icon: <AlertTriangle className="w-3 h-3" /> },
  'ERROR': { color: 'bg-red-100 text-red-800', icon: <AlertCircle className="w-3 h-3" /> },
  'ARCHIVED': { color: 'bg-blue-100 text-blue-800', icon: <Database className="w-3 h-3" /> },
  // Additional statuses that might exist
  'COMPLETED': { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
  'PENDING': { color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-3 h-3" /> },
  'PROCESSING': { color: 'bg-blue-100 text-blue-800', icon: <Activity className="w-3 h-3" /> },
  'FAILED': { color: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" /> },
  'SKIPPED': { color: 'bg-gray-100 text-gray-600', icon: <MinusCircle className="w-3 h-3" /> },
};

export const URLStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  const statusKey = status || 'UNKNOWN';
  const config = URL_STATUS_CONFIG[statusKey] || { color: 'bg-gray-100 text-gray-800', icon: null };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.icon}
      {status || 'Unknown'}
    </span>
  );
};

// ===================================================================
// GAME STATUS BADGE
// ===================================================================

const GAME_STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label?: string }> = {
  'SCHEDULED': { 
    color: 'bg-blue-100 text-blue-800', 
    icon: <Calendar className="w-3 h-3" />,
    label: 'Scheduled'
  },
  'REGISTERING': { 
    color: 'bg-cyan-100 text-cyan-800', 
    icon: <Users className="w-3 h-3" />,
    label: 'Registering'
  },
  'RUNNING': { 
    color: 'bg-green-100 text-green-800', 
    icon: <PlayCircle className="w-3 h-3" />,
    label: 'Running'
  },
  'FINISHED': { 
    color: 'bg-gray-100 text-gray-800', 
    icon: <CheckCircle className="w-3 h-3" />,
    label: 'Finished'
  },
  'CANCELLED': { 
    color: 'bg-red-100 text-red-800', 
    icon: <XCircle className="w-3 h-3" />,
    label: 'Cancelled'
  },
  'INITIATING': { 
    color: 'bg-purple-100 text-purple-800', 
    icon: <Activity className="w-3 h-3" />,
    label: 'Initiating'
  },
  'NOT_IN_USE': { 
    color: 'bg-gray-100 text-gray-600', 
    icon: <MinusCircle className="w-3 h-3" />,
    label: 'Not In Use'
  },
  'NOT_PUBLISHED': { 
    color: 'bg-yellow-100 text-yellow-800', 
    icon: <AlertTriangle className="w-3 h-3" />,
    label: 'Not Published'
  },
  'CLOCK_STOPPED': { 
    color: 'bg-orange-100 text-orange-800', 
    icon: <StopCircle className="w-3 h-3" />,
    label: 'Clock Stopped'
  },
  'UNKNOWN': { 
    color: 'bg-gray-100 text-gray-600', 
    icon: <HelpCircle className="w-3 h-3" />,
    label: 'Unknown'
  },
  // Additional scraper-specific statuses
  'PUBLISHED': { 
    color: 'bg-green-100 text-green-800', 
    icon: <CheckCircle className="w-3 h-3" />,
    label: 'Published'
  },
  'COMPLETED': { 
    color: 'bg-purple-100 text-purple-800', 
    icon: <CheckCircle className="w-3 h-3" />,
    label: 'Completed'
  },
  'NOT_FOUND': { 
    color: 'bg-gray-100 text-gray-600', 
    icon: <MinusCircle className="w-3 h-3" />,
    label: 'Not Found'
  },
};

export const GameStatusBadge: React.FC<{ 
  status: string | null | undefined;
  showUnparsed?: boolean;
}> = ({ status, showUnparsed = true }) => {
  if (!status) {
    if (!showUnparsed) return null;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-50 text-gray-400 border border-gray-200">
        <HelpCircle className="w-3 h-3" />
        Not Parsed
      </span>
    );
  }
  
  const config = GAME_STATUS_CONFIG[status] || { 
    color: 'bg-gray-100 text-gray-800', 
    icon: <HelpCircle className="w-3 h-3" />,
    label: status
  };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.icon}
      {config.label || status}
    </span>
  );
};

// ===================================================================
// DATA SOURCE BADGE
// ===================================================================

export type DataSourceType = 's3' | 'web' | 'none' | 'pending';

const DATA_SOURCE_CONFIG: Record<DataSourceType, { 
  label: string; 
  icon: React.ReactNode; 
  className: string;
  tooltip: string;
}> = {
  's3': {
    label: 'S3 Cache',
    icon: <HardDrive className="w-3 h-3" />,
    className: 'bg-purple-100 text-purple-700 border-purple-200',
    tooltip: 'Data retrieved from S3 cache storage'
  },
  'web': {
    label: 'Web Scrape',
    icon: <Globe className="w-3 h-3" />,
    className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    tooltip: 'Data fetched live via web scraping'
  },
  'none': {
    label: 'Not Retrieved',
    icon: <Ban className="w-3 h-3" />,
    className: 'bg-gray-100 text-gray-600 border-gray-300',
    tooltip: 'Data not retrieved - skipped or do not scrape'
  },
  'pending': {
    label: 'Pending',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    className: 'bg-slate-100 text-slate-500 border-slate-200',
    tooltip: 'Retrieval method pending'
  }
};

export const DataSourceBadge: React.FC<{ 
  source: DataSourceType;
  compact?: boolean;
}> = ({ source, compact = false }) => {
  const config = DATA_SOURCE_CONFIG[source];
  
  if (compact) {
    return (
      <span 
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded border ${config.className}`}
        title={config.tooltip}
      >
        {config.icon}
      </span>
    );
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border ${config.className}`}
      title={config.tooltip}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

// ===================================================================
// PROCESSING STATUS BADGE
// ===================================================================

export type ProcessingStatusType = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'warning' | 'skipped' | 'error';

const PROCESSING_STATUS_CONFIG: Record<ProcessingStatusType, { 
  color: string; 
  icon: React.ReactNode; 
  label: string;
}> = {
  'pending': { 
    color: 'bg-gray-100 text-gray-600', 
    icon: <Clock className="w-3 h-3" />,
    label: 'Pending'
  },
  'scraping': { 
    color: 'bg-blue-100 text-blue-700', 
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: 'Scraping'
  },
  'saving': { 
    color: 'bg-blue-100 text-blue-700', 
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: 'Saving'
  },
  'review': { 
    color: 'bg-purple-100 text-purple-700', 
    icon: <AlertCircle className="w-3 h-3" />,
    label: 'Review'
  },
  'success': { 
    color: 'bg-green-100 text-green-700', 
    icon: <CheckCircle className="w-3 h-3" />,
    label: 'Success'
  },
  'warning': { 
    color: 'bg-amber-100 text-amber-700', 
    icon: <AlertTriangle className="w-3 h-3" />,
    label: 'Warning'
  },
  'skipped': { 
    color: 'bg-yellow-100 text-yellow-700', 
    icon: <MinusCircle className="w-3 h-3" />,
    label: 'Skipped'
  },
  'error': { 
    color: 'bg-red-100 text-red-700', 
    icon: <XCircle className="w-3 h-3" />,
    label: 'Error'
  }
};

export const ProcessingStatusBadge: React.FC<{ 
  status: ProcessingStatusType;
  message?: string;
}> = ({ status, message }) => {
  const config = PROCESSING_STATUS_CONFIG[status];
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.color}`}
      title={message}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

// ===================================================================
// METRIC CARD (also from ScraperAdminShared)
// ===================================================================

export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
}> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700'
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className={`inline-flex p-2 rounded-lg ${colorClasses[color]} mb-2`}>
        {icon}
      </div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
};