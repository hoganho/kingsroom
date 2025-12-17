// src/pages/scraper-admin-tabs/JobHistoryTab.tsx
// UPDATED: Better error handling, correct status enum values

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    Eye,
    AlertCircle,
    AlertTriangle
} from 'lucide-react';
import { getScraperJobsReport } from '../../graphql/queries';
import type { ScraperJob, ScraperJobStatus } from '../../API';
import { JobStatusBadge } from '../../components/scraper/shared/StatusBadges';
import { JobDetailsModal } from '../../components/scraper/admin/ScraperModals';

export const JobHistoryTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [jobs, setJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backendUnavailable, setBackendUnavailable] = useState(false);
    const [selectedJob, setSelectedJob] = useState<ScraperJob | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScraperJobStatus | 'ALL'>('ALL');

    const loadJobs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            
            const response = await client.graphql({
                query: getScraperJobsReport,
                variables: { 
                    status: statusFilter === 'ALL' ? null : statusFilter,
                    limit: 50 
                }
            }) as any;
            
            if (response.data?.getScraperJobsReport) {
                setJobs(response.data.getScraperJobsReport.items || []);
                setBackendUnavailable(false);
            } else if (response.errors?.length) {
                console.warn('GraphQL errors:', response.errors);
                const isLambdaError = response.errors.some((e: any) => 
                    e.errorType?.includes('Lambda') || e.message?.includes('Lambda')
                );
                if (isLambdaError) {
                    setBackendUnavailable(true);
                } else {
                    setError(response.errors[0]?.message || 'Failed to load jobs');
                }
            }
        } catch (err: any) {
            console.error('Error loading jobs:', err);
            if (err?.message?.includes('Lambda') || err?.message?.includes('Unhandled')) {
                setBackendUnavailable(true);
            } else {
                setError(err?.message || 'An error occurred while loading jobs');
            }
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter]);

    useEffect(() => {
        loadJobs();
    }, [loadJobs]);

    // Format duration helper
    const formatDuration = (seconds: number | null | undefined): string => {
        if (!seconds) return '-';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Job History</h3>
                    <div className="flex items-center space-x-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                        >
                            <option value="ALL">All Statuses</option>
                            {/* Use correct ScraperJobStatus enum values */}
                            <option value="QUEUED">Queued/Running</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="FAILED">Failed</option>
                            <option value="CANCELLED">Cancelled</option>
                            <option value="TIMEOUT">Timeout</option>
                        </select>
                        <button
                            onClick={loadJobs}
                            disabled={loading}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Backend Unavailable Warning */}
            {backendUnavailable && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-yellow-800 font-medium">Backend Unavailable</p>
                        <p className="text-xs text-yellow-700 mt-1">
                            The scraperManagement Lambda may not be deployed. Deploy it to see job history.
                        </p>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !backendUnavailable && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-red-800 font-medium">Failed to load jobs</p>
                        <p className="text-xs text-red-600 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {loading && jobs.length === 0 ? (
                <div className="flex justify-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Job ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Trigger
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Start Time
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Duration
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    URLs
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    New/Updated
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Success
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {jobs.map((job) => (
                                <tr key={job.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <span title={job.jobId || job.id}>
                                            {(job.jobId || job.id)?.slice(0, 8)}...
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <JobStatusBadge status={job.status} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.triggerSource || 'MANUAL'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.startTime ? new Date(job.startTime).toLocaleString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {formatDuration(job.durationSeconds)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.totalURLsProcessed || 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className="text-green-600">{job.newGamesScraped || 0}</span>
                                        {' / '}
                                        <span className="text-blue-600">{job.gamesUpdated || 0}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {Math.round(job.successRate || 0)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => setSelectedJob(job)}
                                            className="text-blue-600 hover:text-blue-800 p-1"
                                            title="View Details"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {jobs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                                        {backendUnavailable 
                                            ? 'Deploy the scraperManagement Lambda to see job history.'
                                            : 'No jobs found. Start a scrape job from the Scrape tab.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Job Details Modal */}
            {selectedJob && (
                <JobDetailsModal 
                    job={selectedJob} 
                    onClose={() => setSelectedJob(null)} 
                />
            )}
        </div>
    );
};

export default JobHistoryTab;