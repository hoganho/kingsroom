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
    enableCreateVenue = false
}) => {
    const [countdown, setCountdown] = useState('');
    
    // Auto-expand when venue needs to be selected
    const needsVenueSelection = showVenueSelector && !selectedVenueId && !game.existingGameId && !game.saveResult;
    const [isExpanded, setIsExpanded] = useState(needsVenueSelection);
    
    // Update expansion state when venue selection need changes
    useEffect(() => {
        if (needsVenueSelection && !isExpanded) {
            setIsExpanded(true);
        }
    }, [needsVenueSelection]);
    
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
    const colorClass = needsVenueSelection 
        ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100' 
        : getListItemColorClass(data?.gameStatus, data?.registrationStatus);
    const isClickable = !!onClick && !hasError && data?.gameStatus !== 'FINISHED';
    const isSaveDisabled = !selectedVenueId || game.jobStatus === 'SAVING' || !data;
    const isInDatabase = !!(game.existingGameId || game.saveResult);
    const hasDoNotScrape = !!data?.doNotScrape;

    // Database Status Component
    const DatabaseStatus = () => {
        if (isInDatabase) {
            return (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${hasDoNotScrape ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-green-100 text-green-800 border border-green-300'}`}>
                    <Database className="h-3.5 w-3.5" />
                    <span>IN DATABASE</span>
                    {hasDoNotScrape && (
                        <AlertCircle className="h-3.5 w-3.5" />
                    )}
                </div>
            );
        }
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                <Database className="h-3.5 w-3.5" />
                <span>NOT IN DATABASE</span>
            </div>
        );
    };

    return (
        <div className={`border ${needsVenueSelection ? 'border-2' : ''} rounded-lg transition-all ${colorClass} ${isClickable ? 'cursor-pointer' : ''}`}>
            <div onClick={isClickable ? onClick : undefined} className="p-3 sm:p-4 space-y-3">
                {/* Top Row - ID/URL, DB Status, and Actions */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                        {/* URL/ID Display */}
                        <a
                            href={game.id}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs sm:text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {getDisplayId(game.id)}
                        </a>
                        
                        {/* Database Status Badge */}
                        <DatabaseStatus />
                    </div>
                    
                    {/* Action Buttons */}
                    {showActions && (
                        <div className="flex items-center gap-2">
                            {onViewDetails && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onViewDetails();
                                    }}
                                    className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="View Details"
                                >
                                    <Eye className="h-4 w-4" />
                                </button>
                            )}
                            
                            {onRefresh && !hasDoNotScrape && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRefresh();
                                    }}
                                    className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="Refresh"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </button>
                            )}
                            
                            {onRemove && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove();
                                    }}
                                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Remove"
                                >
                                    <XCircle className="h-4 w-4" />
                                </button>
                            )}
                            
                            {onSave && !isInDatabase && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSave();
                                    }}
                                    disabled={isSaveDisabled}
                                    className={`px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${isSaveDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'}`}
                                    title={isSaveDisabled ? 'Select a venue first' : 'Save to Database'}
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    Save
                                </button>
                            )}
                            
                            {/* Expand/Collapse Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                                title={isExpanded ? "Collapse" : "Expand"}
                            >
                                <ChevronDown className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Tournament Name */}
                <div>
                    <h3 className={`font-medium text-sm sm:text-base ${hasError ? 'text-red-700' : 'text-gray-900'} break-words`}>
                        {data?.name || 'Loading...'}
                    </h3>
                </div>

                {/* Status Badges and Tournament Details Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    {/* Status Badges */}
                    <div className="flex items-center flex-wrap gap-2">
                        {game.jobStatus && (
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${getJobStatusColor(game.jobStatus)}`}>
                                {game.jobStatus.replace(/_/g, ' ')}
                            </span>
                        )}
                        
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
                    <p className="text-xs sm:text-sm text-red-600 break-words">
                        Error: {game.errorMessage}
                    </p>
                )}

                {/* Do Not Scrape Warning */}
                {hasDoNotScrape && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="font-medium">Do Not Scrape flag active</span>
                    </div>
                )}
                
                {/* Venue Selection Required Indicator (only when collapsed) */}
                {!isExpanded && needsVenueSelection && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded text-xs font-medium animate-pulse">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Venue selection required</span>
                    </div>
                )}
            </div>

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