// src/components/scraper/GameListItem.tsx

import React, { useState, useEffect } from 'react';
import { 
    Save, 
    Eye, 
    ExternalLink, 
    RefreshCw,
    XCircle,
    AlertCircle,
    Clock,
    Users,
    DollarSign,
    ChevronDown,
    Database,
    HardDrive,
    Zap,
    CheckCircle,
    Loader2,
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
    dataSource?: 'live' | 's3' | 'skipped';
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
                    setCountdown(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
                }
            };
            
            calculateCountdown();
            interval = setInterval(calculateCountdown, 1000);
        } else {
            setCountdown('');
        }
        
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [game.autoRefresh, game.lastFetched, game.data?.doNotScrape]);

    const hasError = !!game.errorMessage;
    const data = game.data;
    const isClickable = !!onClick && !hasError && data?.gameStatus !== 'FINISHED';
    const isSaveDisabled = !selectedVenueId || game.jobStatus === 'SAVING' || !data;
    const isInDatabase = !!(game.existingGameId || game.saveResult);
    const hasDoNotScrape = !!data?.doNotScrape;

    // Get status icon for compact mode
    const getStatusIcon = () => {
        if (!processingStatus) return null;
        switch (processingStatus) {
            case 'success':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'error':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'skipped':
                return <AlertCircle className="h-4 w-4 text-yellow-600" />;
            case 'scraping':
            case 'saving':
                return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
            case 'review':
                return <Eye className="h-4 w-4 text-purple-600" />;
            default:
                return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };

    // Determine color class based on mode
    const colorClass = compact && processingStatus
        ? getProcessingStatusStyles(processingStatus)
        : needsVenueSelection 
            ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100' 
            : getListItemColorClass(data?.gameStatus, data?.registrationStatus);

    // Database Status Component
    const DatabaseStatus = () => {
        if (isInDatabase) {
            return (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${hasDoNotScrape ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-green-100 text-green-800 border border-green-300'}`}>
                    <Database className="h-3.5 w-3.5" />
                    <span>IN DATABASE</span>
                </div>
            );
        }
        return null;
    };

    // ===================================================================
    // COMPACT MODE RENDER
    // ===================================================================
    if (compact) {
        return (
            <div className={`border rounded-md transition-all ${colorClass}`}>
                {/* Compact Header Row */}
                <div 
                    className="flex items-center justify-between p-2 cursor-pointer"
                    onClick={() => data && setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {getStatusIcon()}
                        <code className="text-xs font-mono bg-white bg-opacity-60 px-1.5 py-0.5 rounded">
                            {tournamentId || getDisplayId(game.id)}
                        </code>
                        
                        {/* Tournament name if available */}
                        {data?.name ? (
                            <span className="text-sm text-gray-900 truncate font-medium">
                                {data.name}
                            </span>
                        ) : (
                            <span className="text-sm text-gray-600 truncate">
                                {processingMessage || game.errorMessage || 'Loading...'}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        {/* Data source indicator */}
                        {dataSource && (
                            <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                                dataSource === 's3' 
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                                    : dataSource === 'skipped'
                                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                    : 'bg-cyan-100 text-cyan-700 border border-cyan-200'
                            }`}>
                                {dataSource === 's3' ? (
                                    <>
                                        <HardDrive className="h-3 w-3" />
                                        S3
                                    </>
                                ) : dataSource === 'skipped' ? (
                                    <>
                                        <AlertCircle className="h-3 w-3" />
                                        Skipped
                                    </>
                                ) : (
                                    <>
                                        <Zap className="h-3 w-3" />
                                        Live
                                    </>
                                )}
                            </span>
                        )}

                        {/* Quick stats when we have data */}
                        {data && (
                            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                                {data.gameStatus && (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                        data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-700' :
                                        data.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-600' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {data.gameStatus}
                                    </span>
                                )}
                                {data.buyIn && (
                                    <span className="flex items-center">
                                        <DollarSign className="h-3 w-3" />
                                        {data.buyIn}
                                    </span>
                                )}
                                {data.totalEntries !== undefined && (
                                    <span className="flex items-center">
                                        <Users className="h-3 w-3 mr-0.5" />
                                        {data.totalEntries}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Database status indicator */}
                        {isInDatabase && (
                            <Database className="h-3.5 w-3.5 text-green-600" />
                        )}

                        {/* View details button */}
                        {data && onViewDetails && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                View
                            </button>
                        )}
                        
                        {data && (
                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                    </div>
                </div>

                {/* Expanded Details for Compact Mode */}
                {isExpanded && data && (
                    <div className="border-t border-gray-200 p-3 bg-white bg-opacity-50 space-y-3">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {data.gameStartDateTime && (
                                <div>
                                    <span className="text-gray-500">Start:</span>
                                    <p className="font-medium">
                                        {new Date(data.gameStartDateTime).toLocaleDateString()}{' '}
                                        {new Date(data.gameStartDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            )}
                            {data.buyIn && (
                                <div>
                                    <span className="text-gray-500">Buy-in:</span>
                                    <p className="font-medium">${data.buyIn}</p>
                                </div>
                            )}
                            {data.totalEntries !== undefined && (
                                <div>
                                    <span className="text-gray-500">Entries:</span>
                                    <p className="font-medium">{data.totalEntries}</p>
                                </div>
                            )}
                            {data.prizepool && (
                                <div>
                                    <span className="text-gray-500">Prize Pool:</span>
                                    <p className="font-medium">${data.prizepool}</p>
                                </div>
                            )}
                        </div>

                        {/* Venue Selector - for saving scraped results */}
                        {showVenueSelector && !isInDatabase && (
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-700">
                                    Select Venue to Save
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
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={game.jobStatus === 'SAVING'}
                                    >
                                        <option value="">Select Venue...</option>
                                        {venues.map(venue => (
                                            <option key={venue.id} value={venue.id}>
                                                {formatVenueOption(venue)}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            {/* Save Button - available if we have data and venue selected */}
                            {showActions && onSave && !isInDatabase && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSave(); }}
                                    disabled={isSaveDisabled}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    <Save className="h-3 w-3" />
                                    Review & Save
                                </button>
                            )}

                            {/* Source Link */}
                            {sourceUrl && (
                                <a 
                                    href={sourceUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center text-xs text-blue-600 hover:underline"
                                >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View source
                                </a>
                            )}
                        </div>

                        {/* Database Status */}
                        {isInDatabase && (
                            <div className="flex items-center gap-1 text-xs text-green-700">
                                <Database className="h-3 w-3" />
                                <span>Saved: {game.existingGameId || game.saveResult?.id}</span>
                            </div>
                        )}

                        {/* Error message */}
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

    // ===================================================================
    // STANDARD MODE RENDER (Original)
    // ===================================================================
    return (
        <div
            className={`border rounded-lg overflow-hidden transition-all duration-200 ${colorClass} ${isClickable ? 'cursor-pointer' : ''}`}
            onClick={isClickable ? onClick : undefined}
        >
            {/* Header section */}
            <div className="p-3 sm:p-4">
                {/* Top row with expand/collapse and status badges */}
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Expand/Collapse toggle */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
                            }}
                            className="p-1 hover:bg-black hover:bg-opacity-5 rounded transition-colors"
                        >
                            <ChevronDown 
                                className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                            />
                        </button>

                        {/* Tournament ID */}
                        <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded">
                            {getDisplayId(game.id)}
                        </span>

                        {/* Job status badge */}
                        {game.jobStatus && (
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getJobStatusColor(game.jobStatus)}`}>
                                {game.jobStatus === 'FETCHING' || game.jobStatus === 'SCRAPING' || game.jobStatus === 'PARSING' ? (
                                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                ) : null}
                                {game.jobStatus}
                            </span>
                        )}

                        {/* Data source indicator */}
                        {dataSource && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${
                                dataSource === 's3' 
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                                    : 'bg-cyan-100 text-cyan-700 border border-cyan-200'
                            }`}>
                                {dataSource === 's3' ? (
                                    <>
                                        <HardDrive className="h-3 w-3" />
                                        S3
                                    </>
                                ) : (
                                    <>
                                        <Zap className="h-3 w-3" />
                                        Live
                                    </>
                                )}
                            </span>
                        )}

                        {/* Database status */}
                        <DatabaseStatus />
                    </div>

                    {/* Action buttons */}
                    {showActions && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {onViewDetails && data && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onViewDetails();
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                                    title="View details"
                                >
                                    <Eye className="h-4 w-4" />
                                </button>
                            )}
                            {onRefresh && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRefresh();
                                    }}
                                    className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                                    title="Refresh"
                                    disabled={game.jobStatus === 'FETCHING' || game.jobStatus === 'SCRAPING'}
                                >
                                    <RefreshCw className={`h-4 w-4 ${game.jobStatus === 'FETCHING' || game.jobStatus === 'SCRAPING' ? 'animate-spin' : ''}`} />
                                </button>
                            )}
                            {onSave && !isInDatabase && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSave();
                                    }}
                                    className="p-1.5 text-green-600 hover:bg-green-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Save to database"
                                    disabled={isSaveDisabled}
                                >
                                    <Save className="h-4 w-4" />
                                </button>
                            )}
                            {onRemove && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove();
                                    }}
                                    className="p-1.5 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                                    title="Remove"
                                >
                                    <XCircle className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Tournament name and status */}
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