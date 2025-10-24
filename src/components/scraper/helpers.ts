import type { JobStatus } from '../../../types/game';

/**
 * Helper to get status color
 */
export const getStatusColor = (status: JobStatus): string => {
    switch(status) {
        case 'IDLE': return 'bg-gray-500';
        case 'FETCHING': return 'bg-blue-500';
        case 'SCRAPING': return 'bg-blue-600 animate-pulse';
        case 'PARSING': return 'bg-indigo-600 animate-pulse';
        case 'READY_TO_SAVE': return 'bg-green-500';
        case 'SAVING': return 'bg-yellow-500 animate-pulse';
        case 'DONE': return 'bg-green-700';
        case 'ERROR': return 'bg-red-500';
        default: return 'bg-gray-500';
    }
};

