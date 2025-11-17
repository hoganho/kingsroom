// src/components/scraper/admin/ScraperAdminShared.tsx
// Contains shared components for the Scraper Admin page

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
    HelpCircle
} from 'lucide-react';

import type { 
    ScraperJobStatus,
    ScrapeURLStatus,
    GameStatus
} from '../../../../src/API'; // Adjusted path

// ===================================================================
// SHARED COMPONENTS
// ===================================================================

export const JobStatusBadge: React.FC<{ status: ScraperJobStatus }> = ({ status }) => {
    const config: Record<ScraperJobStatus, { color: string; icon: React.ReactNode }> = {
        'QUEUED': { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-3 h-3" /> },
        'RUNNING': { color: 'bg-blue-100 text-blue-800', icon: <Activity className="w-3 h-3 animate-pulse" /> },
        'COMPLETED': { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
        'FAILED': { color: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" /> },
        'CANCELLED': { color: 'bg-yellow-100 text-yellow-800', icon: <AlertTriangle className="w-3 h-3" /> },
        'TIMEOUT': { color: 'bg-orange-100 text-orange-800', icon: <AlertCircle className="w-3 h-3" /> }
    };
    
    const { color, icon } = config[status] || { color: 'bg-gray-100 text-gray-800', icon: null };
    
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${color}`}>
            {icon}
            {status}
        </span>
    );
};

export const URLStatusBadge: React.FC<{ status: ScrapeURLStatus }> = ({ status }) => {
    const config: Record<ScrapeURLStatus, { color: string; icon: React.ReactNode }> = {
        'ACTIVE': { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
        'INACTIVE': { color: 'bg-gray-100 text-gray-800', icon: <Pause className="w-3 h-3" /> },
        'DO_NOT_SCRAPE': { color: 'bg-yellow-100 text-yellow-800', icon: <AlertTriangle className="w-3 h-3" /> },
        'ERROR': { color: 'bg-red-100 text-red-800', icon: <AlertCircle className="w-3 h-3" /> },
        'ARCHIVED': { color: 'bg-blue-100 text-blue-800', icon: <Database className="w-3 h-3" /> }
    };
    
    const { color, icon } = config[status] || { color: 'bg-gray-100 text-gray-800', icon: null };
    
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${color}`}>
            {icon}
            {status}
        </span>
    );
};

export const GameStatusBadge: React.FC<{ 
    status: GameStatus | null | undefined;
    showUnparsed?: boolean;
}> = ({ status, showUnparsed = true }) => {
    // Handle null/undefined - not yet parsed
    if (!status) {
        if (!showUnparsed) return null;
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                <HelpCircle className="w-3 h-3" />
                Not Parsed
            </span>
        );
    }
    
    const config: Record<GameStatus, { color: string; icon: React.ReactNode; label?: string }> = {
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
        }
    };
    
    const statusConfig = config[status] || { 
        color: 'bg-gray-100 text-gray-800', 
        icon: <HelpCircle className="w-3 h-3" />,
        label: status
    };
    
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${statusConfig.color}`}>
            {statusConfig.icon}
            {statusConfig.label || status}
        </span>
    );
};

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