// src/components/scraper/admin/ScraperModals.tsx
// Merged modal components for scraper admin
// MERGED FROM: GameDetailsModal.tsx + JobDetailsModal.tsx

import React from 'react';
import { XCircle } from 'lucide-react';
import { ScraperReport } from '../ScraperReport';
import { JobStatusBadge } from '../shared/StatusBadges';
import type { ScraperJob } from '../../../API';

// ===================================================================
// SHARED MODAL WRAPPER
// ===================================================================

interface ModalWrapperProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({ 
  title, 
  onClose, 
  children, 
  maxWidth = '4xl' 
}) => {
  const maxWidthClass = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg ${maxWidthClass} w-full max-h-[80vh] overflow-y-auto m-4`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// GAME DETAILS MODAL
// ===================================================================

export interface GameDetailsModalProps {
  game: { data?: any } | null;
  onClose: () => void;
}

export const GameDetailsModal: React.FC<GameDetailsModalProps> = ({ game, onClose }) => {
  if (!game) return null;

  return (
    <ModalWrapper 
      title={game.data?.name || 'Game Details'} 
      onClose={onClose}
    >
      <ScraperReport data={game.data as any} />
    </ModalWrapper>
  );
};

// ===================================================================
// JOB DETAILS MODAL
// ===================================================================

export interface JobDetailsModalProps {
  job: ScraperJob | null;
  onClose: () => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({ job, onClose }) => {
  if (!job) return null;
  
  return (
    <ModalWrapper 
      title={`Job Details: ${job.jobId}`} 
      onClose={onClose}
    >
      {/* Job Info */}
      <div className="mb-6">
        <h3 className="font-semibold mb-3">Job Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <JobStatusBadge status={job.status} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Trigger Source</p>
            <p className="font-medium">{job.triggerSource}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Start Time</p>
            <p className="font-medium">{new Date(job.startTime).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Duration</p>
            <p className="font-medium">
              {job.durationSeconds ? `${job.durationSeconds}s` : 'In progress...'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Metrics */}
      <div className="mb-6">
        <h3 className="font-semibold mb-3">Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
          <MetricItem label="URLs Processed" value={job.totalURLsProcessed || 0} />
          <MetricItem label="New Games" value={job.newGamesScraped || 0} className="text-green-600" />
          <MetricItem label="Updated" value={job.gamesUpdated || 0} className="text-blue-600" />
          <MetricItem label="Errors" value={job.errors || 0} className="text-red-600" />
          <MetricItem label="Success Rate" value={`${Math.round(job.successRate || 0)}%`} />
        </div>
      </div>
      
      {/* Failed URLs */}
      {job.failedURLs && job.failedURLs.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Failed URLs ({job.failedURLs.length})</h3>
          <div className="bg-red-50 rounded-lg p-4 max-h-48 overflow-y-auto">
            {job.failedURLs.map((url, idx) => (
              <div key={idx} className="text-sm text-red-800 py-1 font-mono">
                {url}
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalWrapper>
  );
};

// Helper component for metrics
const MetricItem: React.FC<{ 
  label: string; 
  value: string | number; 
  className?: string 
}> = ({ label, value, className = '' }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-lg font-semibold ${className}`}>{value}</p>
  </div>
);

// ===================================================================
// EXPORTS
// ===================================================================

export default {
  GameDetailsModal,
  JobDetailsModal,
};