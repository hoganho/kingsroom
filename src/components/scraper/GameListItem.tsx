// src/components/scraper/GameListItem.tsx

import React, { useState, useEffect } from 'react';
import { 
    Save, 
    Eye, 
    RefreshCw,
    XCircle,
    AlertCircle,
    Clock,
    Users,
    DollarSign,
    ChevronDown,
    Database,
    HardDrive,
    CheckCircle,
    Loader2,
    Ban,
    Globe,
    HelpCircle,  // ✅ NEW: Icon for pending state
} from 'lucide-react';
import type { GameState } from '../../types/game';
import type { Venue } from '../../API';
import { POLLING_INTERVAL } from '../../hooks/useGameTracker';

// Helper function for status colors
const getListItemColorClass = (gameStatus?: string, registrationStatus?: string): string => {
    switch (gameStatus) {
        case 'RUNNING':
            if (registrationStatus === 'OPEN') return 'bg-green-50 border-green-200 hover:bg-green-100';
            if (registrationStatus === 'CLOSED') return 'bg-green-100 border-green-300 hover:bg-green-150';
            return 'bg-green-50 border-green-200 hover:bg-green-100';
        case 'SCHEDULED':
            if (registrationStatus === 'OPEN') return 'bg-blue-50 border-blue-200 hover:bg-blue-100';
            return 'bg-blue-50 border-blue-100 hover:bg-blue-100';
        case 'REGISTERING':
            if (registrationStatus === 'FINAL') return 'bg-orange-50 border-orange-200 hover:bg-orange-100';
            return 'bg-orange-50 border-orange-100 hover:bg-orange-100';
        case 'CLOCK STOPPED':
            return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';
        case 'FINISHED':
            return 'bg-gray-50 border-gray-200 hover:bg-gray-100';
        default:
            return 'bg-white border-gray-200 hover:bg-gray-50';
    }
};

// Helper function for job status colors
const getJobStatusColor = (status: string): string => {
    switch (status) {
        case 'FETCHING':
        case 'SCRAPING':
        case 'PARSING':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'READY_TO_SAVE':
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'SAVING':
            return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'DONE':
            return 'bg-green-100 text-green-800 border-green-200';
        case 'ERROR':
            return 'bg-red-100 text-red-800 border-red-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
};

// Processing result status type (for compact mode)
type ProcessingStatus = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'skipped' | 'error';

// Helper for processing status colors (compact mode)
const getProcessingStatusStyles = (status: ProcessingStatus): string => {
    switch (status) {
        case 'success':
            return 'bg-green-50 border-green-200';
        case 'error':
            return 'bg-red-50 border-red-200';
        case 'skipped':
            return 'bg-yellow-50 border-yellow-200';
        case 'scraping':
        case 'saving':
            return 'bg-blue-50 border-blue-200';
        case 'review':
            return 'bg-purple-50 border-purple-300';
        default:
            return 'bg-gray-50 border-gray-200';
    }
};

// ✅ UPDATED: Data source badge configuration - added 'pending' type
const DATA_SOURCE_CONFIG = {
    's3': {
        label: 'S3 Cache',
        icon: HardDrive,
        className: 'bg-purple-100 text-purple-700 border-purple-200',
        tooltip: 'Data retrieved from S3 cache storage'
    },
    'web': {
        label: 'Web Scrape',
        icon: Globe,
        className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
        tooltip: 'Data fetched via web scraping'
    },
    'none': {
        label: 'Not Retrieved',
        icon: Ban,
        className: 'bg-gray-100 text-gray-600 border-gray-300',
        tooltip: 'Data not retrieved - marked as Do Not Scrape'
    },
    // ✅ NEW: Pending state - shown before retrieval method is determined
    'pending': {
        label: 'Awaiting Retrieval',
        icon: HelpCircle,
        className: 'bg-slate-100 text-slate-500 border-slate-200',
        tooltip: 'Retrieval method pending - waiting in queue'
    }
};

interface GameListItemProps {
    game: GameState;
    venues?: Venue[];
    venuesLoading?: boolean;
    selectedVenueId?: string;
    onVenueChange?: (venueId: string) => void;
    onSave?: () => void;
    onRemove?: () => void;
    onRefresh?: () => void;
    onViewDetails?: () => void;
    mode?: 'manual' | 'bulk' | 'auto';
    showVenueSelector?: boolean;
    showActions?: boolean;
    onClick?: () => void;
    enableCreateVenue?: boolean;
    // ✅ UPDATED: Added 'pending' to dataSource type
    dataSource?: 's3' | 'web' | 'none' | 'pending' | 'live' | 'skipped'; // 'live' and 'skipped' for backward compatibility
    // NEW: Compact mode props
    compact?: boolean;
    processingStatus?: ProcessingStatus;
    processingMessage?: string;
    tournamentId?: number;
    sourceUrl?: string;
}

export const GameListItem: React.FC<GameListItemProps> = ({
    game,
    venues = [],
    venuesLoading = false,
    selectedVenueId,
    onVenueChange,
    onSave,
    onRemove,
    onRefresh,
    onViewDetails,
    showVenueSelector = true,
    showActions = true,
    onClick,
    enableCreateVenue = false,
    dataSource,
    // Compact mode props
    compact = false,
    processingStatus,
    processingMessage,
    tournamentId,
    sourceUrl,
}) => {
    const [countdown, setCountdown] = useState('');
    
    // Auto-expand when venue needs to be selected
    const needsVenueSelection = showVenueSelector && !selectedVenueId && !game.existingGameId && !game.saveResult;
    const [isExpanded, setIsExpanded] = useState(compact ? false : needsVenueSelection);
    
    // Update expansion state when venue selection need changes
    useEffect(() => {
        if (needsVenueSelection && !isExpanded && !compact) {
            setIsExpanded(true);
        }
    }, [needsVenueSelection, compact]);
    
    // Format venue option
    const formatVenueOption = (venue: Venue) => {
        return venue.venueNumber !== undefined 
            ? `${venue.venueNumber} - ${venue.name}`
            : venue.name;
    };

    // Get display ID
    const getDisplayId = (id: string) => {
        if (id.startsWith('http')) {
            const url = new URL(id);
            const urlParams = url.searchParams.get('id');
            return urlParams || url.pathname.split('/').pop() || id.substring(0, 20);
        }
        return id.substring(0, 20);
    };

    // Auto-refresh countdown timer
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        
        if (game.autoRefresh && game.lastFetched && !game.data?.doNotScrape) {
            const calculateCountdown = () => {
                const lastFetchTime = new Date(game.lastFetched as string).getTime();
                const nextFetchTime = lastFetchTime + POLLING_INTERVAL;
                const now = new Date().getTime();
                const remaining = nextFetchTime - now;

                if (remaining <= 0) {
                    setCountdown('Refreshing...');
                } else {
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
                    setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
                }
            };

            calculateCountdown();
            interval = setInterval(calculateCountdown, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [game.autoRefresh, game.lastFetched, game.data?.doNotScrape]);

    const data = game.data;
    const hasError = !!game.errorMessage;
    const hasDoNotScrape = !!data?.doNotScrape;

    // Database status component
    const DatabaseStatus = () => {
        if (game.saveResult) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 border border-green-200">
                    <Database className="h-3 w-3" />
                    Saved
                </span>
            );
        }
        if (game.existingGameId) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 border border-blue-200">
                    <Database className="h-3 w-3" />
                    Exists
                </span>
            );
        }
        return null;
    };

    // ✅ UPDATED: Render data source badge with 'pending' support
    const DataSourceBadge = ({ showLabel = true }: { showLabel?: boolean }) => {
        if (!dataSource) return null;
        
        // Normalize old values to new values for backward compatibility
        let normalizedSource: 's3' | 'web' | 'none' | 'pending' = dataSource as 's3' | 'web' | 'none' | 'pending';
        if (dataSource === 'live' as any) normalizedSource = 'web';
        if (dataSource === 'skipped' as any) normalizedSource = 'none';
        
        const config = DATA_SOURCE_CONFIG[normalizedSource];
        if (!config) {
            console.warn(`Invalid dataSource value: ${dataSource}`);
            return null;
        }
        
        const Icon = config.icon;
        
        return (
            <span 
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded border ${config.className}`}
                title={config.tooltip}
            >
                <Icon className="h-3 w-3" />
                {showLabel && <span>{config.label}</span>}
            </span>
        );
    };

    // --- Compact Mode Rendering ---
    if (compact) {
        const statusIcon = processingStatus === 'success' ? CheckCircle :
                          processingStatus === 'error' ? XCircle :
                          processingStatus === 'scraping' || processingStatus === 'saving' ? Loader2 :
                          processingStatus === 'review' ? Eye :
                          processingStatus === 'skipped' ? AlertCircle :
                          Clock;

        const StatusIcon = statusIcon;
        const isAnimating = processingStatus === 'scraping' || processingStatus === 'saving';

        return (
            <div
                className={`
                    border rounded-lg overflow-hidden transition-colors
                    ${getProcessingStatusStyles(processingStatus || 'pending')}
                    ${onClick ? 'cursor-pointer' : ''}
                `}
                onClick={onClick}
            >
                {/* Compact Header */}
                <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <StatusIcon className={`h-5 w-5 flex-shrink-0 ${
                            processingStatus === 'success' ? 'text-green-600' :
                            processingStatus === 'error' ? 'text-red-600' :
                            processingStatus === 'scraping' || processingStatus === 'saving' ? 'text-blue-600' :
                            processingStatus === 'review' ? 'text-purple-600' :
                            processingStatus === 'skipped' ? 'text-yellow-600' :
                            'text-gray-400'
                        } ${isAnimating ? 'animate-spin' : ''}`} />
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">
                                    {tournamentId || getDisplayId(game.id)}
                                </span>
                                {processingStatus && (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                        processingStatus === 'success' ? 'bg-green-100 text-green-700' :
                                        processingStatus === 'error' ? 'bg-red-100 text-red-700' :
                                        processingStatus === 'scraping' || processingStatus === 'saving' ? 'bg-blue-100 text-blue-700' :
                                        processingStatus === 'review' ? 'bg-purple-100 text-purple-700' :
                                        processingStatus === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {processingStatus === 'review' ? 'Review' :
                                         processingStatus === 'scraping' ? 'Retrieving' :
                                         processingStatus === 'saving' ? 'Saving' :
                                         processingStatus === 'success' ? 'Success' :
                                         processingStatus === 'error' ? 'Error' :
                                         processingStatus === 'skipped' ? 'Skipped' :
                                         'Pending'}
                                    </span>
                                )}
                            </div>
                            
                            {/* Two-step process display */}
                            {processingStatus === 'success' && (
                                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                                    {/* Step 1: Retrieved */}
                                    {dataSource && dataSource !== 'pending' && (
                                        <div className="flex items-center gap-1">
                                            <span className="font-medium text-gray-700">Retrieved:</span>
                                            <span>
                                                {dataSource === 's3' ? 'S3 Cache' :
                                                 dataSource === 'web' ? 'Web Scrape' :
                                                 'None'}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {/* Step 2: Parsed Status */}
                                    <div className="flex items-center gap-1">
                                        <span className="font-medium text-gray-700">Parsed:</span>
                                        <span>
                                            {data?.gameStatus === 'NOT_PUBLISHED' || data?.gameStatus === 'NOT_IN_USE' 
                                                ? `${data.gameStatus} (not saved)` 
                                                : 'Ready to save'}
                                        </span>
                                    </div>
                                    
                                    {/* Tournament name */}
                                    {data?.name && (
                                        <div className="text-gray-700 truncate">
                                            {data.name}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Show processing message for non-success states */}
                            {processingStatus !== 'success' && processingMessage && (
                                <p className="text-xs text-gray-600 truncate mt-0.5">
                                    {processingMessage}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        {/* Data source indicator - ALWAYS show label */}
                        <DataSourceBadge showLabel={true} />

                        {/* Quick stats when we have data */}
                        {data && (
                            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                                {data.gameStatus && (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                        data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-700' :
                                        data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-700' :
                                        data.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {data.gameStatus}
                                    </span>
                                )}
                                {data.buyIn !== undefined && (
                                    <span className="flex items-center gap-0.5">
                                        <DollarSign className="h-3 w-3" />
                                        {data.buyIn}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Database status */}
                        <DatabaseStatus />

                        {/* Action buttons */}
                        {showActions && onViewDetails && data && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewDetails();
                                }}
                                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="View details"
                            >
                                <Eye className="h-4 w-4" />
                            </button>
                        )}

                        {/* Save button - show when NOT currently saving and game hasn't been saved yet */}
                        {/* Allow showing for NOT_PUBLISHED (special placeholder save) or non-doNotScrape games */}
                        {showActions && onSave && processingStatus !== 'saving' && data && (!hasDoNotScrape || data?.gameStatus === 'NOT_PUBLISHED') && !game.saveResult && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSave();
                                }}
                                disabled={!selectedVenueId && !enableCreateVenue}
                                className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={data?.gameStatus === 'NOT_PUBLISHED' ? 'Save as placeholder' : 'Save to database'}
                            >
                                <Save className="h-4 w-4" />
                            </button>
                        )}

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Expandable Details */}
                {isExpanded && (
                    <div className="border-t border-gray-200 p-3 bg-white bg-opacity-50 space-y-2">
                        {/* Venue Selector */}
                        {showVenueSelector && (
                            <div className="space-y-1">
                                <label className="block text-xs font-medium text-gray-700">
                                    Venue
                                </label>
                                {venuesLoading ? (
                                    <div className="text-xs text-gray-500">Loading venues...</div>
                                ) : (
                                    <select
                                        value={selectedVenueId || ''}
                                        onChange={(e) => {
                                            if (onVenueChange) {
                                                onVenueChange(e.target.value);
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={venues.length === 0 && !enableCreateVenue}
                                    >
                                        <option value="">
                                            {venues.length === 0 && !enableCreateVenue ? 'No venues available' : 'Select Venue...'}
                                        </option>
                                        {venues.map(venue => (
                                            <option key={venue.id} value={venue.id}>
                                                {formatVenueOption(venue)}
                                            </option>
                                        ))}
                                        {enableCreateVenue && (
                                            <>
                                                <option disabled>──────────</option>
                                                <option value="create_new" className="font-semibold">
                                                    ➕ Create new venue...
                                                </option>
                                            </>
                                        )}
                                    </select>
                                )}
                            </div>
                        )}

                        {/* Source URL */}
                        {sourceUrl && (
                            <div className="text-xs text-gray-500 break-all">
                                <span className="font-medium">URL:</span> {sourceUrl}
                            </div>
                        )}

                        {/* Data source info - only show if not pending */}
                        {dataSource && dataSource !== 'pending' && (
                            <div className="flex items-center gap-2">
                                <DataSourceBadge />
                            </div>
                        )}

                        {/* Error or additional info */}
                        {hasError && (
                            <p className="text-xs text-red-600">
                                Error: {game.errorMessage}
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // --- Standard Mode Rendering ---
    return (
        <div
            className={`
                border rounded-lg overflow-hidden transition-colors
                ${hasError ? 'border-red-300' : ''}
                ${getListItemColorClass(data?.gameStatus, data?.registrationStatus)}
                ${onClick ? 'cursor-pointer' : ''}
            `}
            onClick={onClick}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    {/* Status Indicator */}
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        hasError ? 'bg-red-500' :
                        hasDoNotScrape ? 'bg-amber-500' :
                        data?.gameStatus === 'RUNNING' ? 'bg-green-500 animate-pulse' :
                        data?.gameStatus === 'SCHEDULED' ? 'bg-blue-500' :
                        data?.gameStatus === 'FINISHED' ? 'bg-gray-400' :
                        'bg-gray-300'
                    }`} />
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-medium text-gray-900">
                                ID: {getDisplayId(game.id)}
                            </span>
                            
                            {game.jobStatus && (
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getJobStatusColor(game.jobStatus)}`}>
                                    {game.jobStatus}
                                </span>
                            )}

                            {/* Data source indicator */}
                            <DataSourceBadge />

                            {/* Database status */}
                            <DatabaseStatus />
                        </div>

                        {/* Action buttons */}
                        {showActions && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {onViewDetails && data && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewDetails();
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                    >
                                        <Eye className="h-3 w-3" />
                                        <span className="hidden sm:inline">View</span>
                                    </button>
                                )}
                                
                                {/* Save button - allow for NOT_PUBLISHED (placeholder save) or non-doNotScrape games */}
                                {onSave && data && (!hasDoNotScrape || data?.gameStatus === 'NOT_PUBLISHED') && !game.saveResult && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSave();
                                        }}
                                        disabled={game.jobStatus === 'SAVING' || (!selectedVenueId && !game.existingGameId && !enableCreateVenue)}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={data?.gameStatus === 'NOT_PUBLISHED' ? 'Save as placeholder' : 'Save to database'}
                                    >
                                        <Save className="h-3 w-3" />
                                        <span className="hidden sm:inline">Save</span>
                                    </button>
                                )}
                                
                                {onRefresh && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRefresh();
                                        }}
                                        disabled={game.jobStatus === 'FETCHING' || game.jobStatus === 'SCRAPING'}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw className={`h-3 w-3 ${game.jobStatus === 'FETCHING' || game.jobStatus === 'SCRAPING' ? 'animate-spin' : ''}`} />
                                        <span className="hidden sm:inline">Refresh</span>
                                    </button>
                                )}
                                
                                {onRemove && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove();
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
                                    >
                                        <XCircle className="h-3 w-3" />
                                        <span className="hidden sm:inline">Remove</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                    className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                    <ChevronDown className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Tournament Info */}
            <div className="px-3 sm:px-4 pb-3">
                <div className="mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                        {data?.name || 'Loading tournament data...'}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        {data?.gameStatus && (
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                                data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-800' :
                                data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                data.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {data.gameStatus}
                            </span>
                        )}

                        {data?.registrationStatus && (
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                                data.registrationStatus === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                                data.registrationStatus === 'CLOSED' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                REG: {data.registrationStatus}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tournament Details */}
                {data && (
                    <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-600">
                        {data.gameStartDateTime && (
                            <div className="flex items-center">
                                <Clock className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">
                                    {new Date(data.gameStartDateTime).toLocaleDateString()} {new Date(data.gameStartDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                        )}
                        
                        {data.buyIn && (
                            <div className="flex items-center">
                                <DollarSign className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">${data.buyIn}</span>
                            </div>
                        )}

                        {data.totalUniquePlayers !== undefined && (
                            <div className="flex items-center">
                                <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">{data.totalUniquePlayers}</span>
                            </div>
                        )}

                        {data.totalInitialEntries !== undefined && (
                            <div className="flex items-center">
                                <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">{data.totalInitialEntries}</span>
                            </div>
                        )}

                        {data.totalInitialEntries !== undefined && (
                            <div className="flex items-center">
                                <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">{data.totalInitialEntries}</span>
                            </div>
                        )}

                        {data.totalEntries !== undefined && (
                            <div className="flex items-center">
                                <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                                <span className="truncate">{data.totalEntries}</span>
                            </div>
                        )}
                        
                        {countdown && (
                            <div className="flex items-center text-blue-600 font-medium">
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-pulse flex-shrink-0" />
                                <span>{countdown}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Error Message */}
            {hasError && (
                <div className="px-3 sm:px-4 pb-3">
                    <p className="text-xs sm:text-sm text-red-600 break-words">
                        Error: {game.errorMessage}
                    </p>
                </div>
            )}

            {/* Do Not Scrape Warning */}
            {hasDoNotScrape && (
                <div className="px-3 sm:px-4 pb-3">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="font-medium">Do Not Scrape flag active</span>
                    </div>
                </div>
            )}
            
            {/* Venue Selection Required Indicator (only when collapsed) */}
            {!isExpanded && needsVenueSelection && (
                <div className="px-3 sm:px-4 pb-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded text-xs font-medium animate-pulse">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Venue selection required</span>
                    </div>
                </div>
            )}

            {/* Expandable Section */}
            {isExpanded && (
                <div className="border-t border-gray-200 p-3 sm:p-4 space-y-3 bg-white bg-opacity-50">
                    {/* Venue Selector */}
                    {showVenueSelector && (
                        <div className={`space-y-2 ${needsVenueSelection ? 'p-3 bg-yellow-50 border border-yellow-200 rounded-lg' : ''}`}>
                            <label className={`block text-sm font-medium ${needsVenueSelection ? 'text-yellow-800' : 'text-gray-700'}`}>
                                {needsVenueSelection ? '⚠️ Select Venue (Required)' : 'Select Venue'}
                            </label>
                            {venuesLoading ? (
                                <div className="text-sm text-gray-500">Loading venues...</div>
                            ) : (
                                <select
                                    value={selectedVenueId || ''}
                                    onChange={(e) => {
                                        if (onVenueChange) {
                                            onVenueChange(e.target.value);
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                        needsVenueSelection ? 'border-yellow-400 bg-white' : 'border-gray-300'
                                    }`}
                                    disabled={game.jobStatus === 'SAVING' || (venues.length === 0 && !enableCreateVenue)}
                                >
                                    <option value="">
                                        {venues.length === 0 && !enableCreateVenue ? 'No venues available' : 'Select Venue...'}
                                    </option>
                                    {venues.map(venue => (
                                        <option key={venue.id} value={venue.id}>
                                            {formatVenueOption(venue)}
                                        </option>
                                    ))}
                                    {enableCreateVenue && (
                                        <>
                                            <option disabled>──────────</option>
                                            <option value="create_new" className="font-semibold">
                                                ➕ Create new venue...
                                            </option>
                                        </>
                                    )}
                                </select>
                            )}
                            {needsVenueSelection && (
                                <p className="text-xs text-yellow-700 mt-1">
                                    Please select a venue to save this tournament to the database.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Additional Info */}
                    {game.lastFetched && (
                        <div className="text-xs text-gray-500">
                            <p>Last fetched: {new Date(game.lastFetched).toLocaleString()}</p>
                            {game.fetchCount && <p>Total fetches: {game.fetchCount}</p>}
                        </div>
                    )}
                    
                    {/* Save Result */}
                    {game.saveResult && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm font-medium text-green-800">✓ Successfully saved to database</p>
                            <p className="text-xs text-green-700 mt-1">Database ID: {game.saveResult.id}</p>
                        </div>
                    )}

                    {/* Database ID if exists */}
                    {game.existingGameId && !game.saveResult && (
                        <div className="text-xs text-gray-500">
                            <p>Database ID: {game.existingGameId}</p>
                        </div>
                    )}

                    {/* Do Not Scrape Details */}
                    {hasDoNotScrape && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm font-medium text-amber-800">⚠️ Scraping Disabled</p>
                            <p className="text-xs text-amber-700 mt-1">This tournament is marked as "Do Not Scrape" in the database</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};