// src/pages/scraper-admin-tabs/JobHistoryTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    Eye
} from 'lucide-react';
import { getScraperJobsReport } from '../../graphql/queries';
import type { ScraperJob, ScraperJobStatus } from '../../API'; // Removed .ts
import { JobStatusBadge } from '../../components/scraper/admin/ScraperAdminShared'; // Removed .tsx
import { JobDetailsModal } from '../../components/scraper/admin/JobDetailsModal'; // Removed .tsx

export const JobHistoryTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [jobs, setJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<ScraperJob | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScraperJobStatus | 'ALL'>('ALL');

    const loadJobs = useCallback(async () => {
        try {
            setLoading(true);
            const response = await client.graphql({
                query: getScraperJobsReport,
                variables: { 
                    status: statusFilter === 'ALL' ? null : statusFilter,
                    limit: 50 
                }
            }) as any;
            
            if (response.data) {
                setJobs(response.data.getScraperJobsReport.items);
            }
        } catch (error) {
            console.error('Error loading jobs:', error);
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter]);

    useEffect(() => {
        loadJobs();
    }, [loadJobs]);

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
                            <option value="COMPLETED">Completed</option>
                            <option value="RUNNING">Running</option>
                            <option value="FAILED">Failed</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                        <button
                            onClick={loadJobs}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Jobs List */}
            {loading ? (
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
                                        {job.jobId?.slice(0, 8)}...
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <JobStatusBadge status={job.status} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.triggerSource}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {new Date(job.startTime).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.durationSeconds ? `${job.durationSeconds}s` : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {job.totalURLsProcessed || 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {Math.round(job.successRate || 0)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => setSelectedJob(job)}
                                            className="text-blue-600 hover:text-blue-800"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
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

