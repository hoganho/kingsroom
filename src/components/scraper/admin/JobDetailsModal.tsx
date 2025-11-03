// src/components/scraper/admin/JobDetailsModal.tsx

import React from 'react';
import { XCircle } from 'lucide-react';
import { JobStatusBadge } from './ScraperAdminShared'; // Removed .tsx from import path
import type { ScraperJob } from '../../../../src/API.ts'; // Adjusted path

export const JobDetailsModal: React.FC<{ 
    job: ScraperJob | null;
    onClose: () => void;
}> = ({ job, onClose }) => {
    if (!job) return null;
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto m-4">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold">Job Details: {job.jobId}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-6">
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
                            <div>
                                <p className="text-xs text-gray-500">URLs Processed</p>
                                <p className="text-lg font-semibold">{job.totalURLsProcessed || 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">New Games</p>
                                <p className="text-lg font-semibold text-green-600">{job.newGamesScraped || 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Updated</p>
                                <p className="text-lg font-semibold text-blue-600">{job.gamesUpdated || 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Errors</p>
                                <p className="text-lg font-semibold text-red-600">{job.errors || 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Success Rate</p>
                                <p className="text-lg font-semibold">{Math.round(job.successRate || 0)}%</p>
                            </div>
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
                </div>
            </div>
        </div>
    );
};

