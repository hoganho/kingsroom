// src/pages/scraper-admin-tabs/SingleScraperTab.tsx
// Enhanced with smart "Track Next" functionality using gap analysis

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Target, FastForward, HardDrive, TrendingUp, Sparkles, Building2 } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { useEntity } from '../../contexts/EntityContext';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { createVenue } from '../../graphql/mutations';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';
import { VenueModal } from '../../components/venues/VenueModal';
import { VenueFormData } from '../../types/venue';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';

// --- ENHANCEMENT: Added props interface ---
interface SingleScraperTabProps {
    urlToReparse: string | null;
    onReparseComplete: () => void;
}

export const SingleScraperTab: React.FC<SingleScraperTabProps> = ({ urlToReparse, onReparseComplete }) => {
    const client = useMemo(() => generateClient(), []);
    const { currentEntity, entities } = useEntity();
    const [inputId, setInputId] = useState('');
    const [findingNext, setFindingNext] = useState(false);
    
    // Track all IDs that have been tracked in this session
    const trackedInSessionRef = useRef<Set<string>>(new Set());
    
    // Note: S3 cache tracking removed since trackGame returns void
    // Cache detection happens internally within the trackGame function
    
    // Initialize the gap tracking hook for smart "next" functionality
    const {
        loading: gapLoading,
        scrapingStatus,
        getScrapingStatus,
    } = useGameIdTracking(currentEntity?.id);
    
    // Use enhanced tracker with proper signatures
    const { 
        games, 
        trackGame, 
        saveGame, 
        removeGame 
    } = useGameTracker();
    
    const [selectedGame, setSelectedGame] = useState<any>(null);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venuesLoading, setVenuesLoading] = useState(false);
    const [selectedVenues, setSelectedVenues] = useState<Record<string, string>>({});
    
    // Venue creation modal state
    const [venueModalOpen, setVenueModalOpen] = useState(false);
    const [creatingVenueForGame, setCreatingVenueForGame] = useState<string | null>(null);
    
    // S3 cache status state
    const [cacheStatus, setCacheStatus] = useState<Record<string, {
        hasCache: boolean;
        s3Key?: string;
        lastCached?: string;
        cacheHits?: number;
    }>>({});
    
    // Modal state for scrape options
    const [scrapeModalInfo, setScrapeModalInfo] = useState<{
        url: string;
        entityId: string;
        hasCache?: boolean;
        doNotScrape?: boolean;
        gameStatus?: string;
        warningMessage?: string;
    } | null>(null);
    
    const [confirmModalData, setConfirmModalData] = useState<{
        game: any;
        venueId: string;
        entityId: string;
    } | null>(null);

    // Load gap analysis on entity change
    useEffect(() => {
        if (currentEntity?.id) {
            loadGapAnalysis();
        }
    }, [currentEntity?.id]);

    const loadGapAnalysis = async () => {
        if (!currentEntity?.id) return;
        
        try {
            await getScrapingStatus({ entityId: currentEntity.id });
        } catch (error) {
            console.error('Error loading gap analysis:', error);
        }
    };

    // Fetch venues filtered by entity
    useEffect(() => {
        if (!currentEntity) return;
        
        const fetchVenues = async () => {
            setVenuesLoading(true);
            try {
                const response = await client.graphql({ 
                    query: listVenuesForDropdown,
                    variables: {
                        filter: {
                            entityId: { eq: currentEntity.id },
                            isSpecial: { ne: true }
                        }
                    }
                }) as any;
                
                const venueItems = (response.data?.listVenues?.items as Venue[])
                    .filter(Boolean)
                    .sort((a, b) => {
                        if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
                            return a.venueNumber - b.venueNumber;
                        }
                        return a.name.localeCompare(b.name);
                    });
                
                setVenues(venueItems);
                console.log(`[SingleScraperTab] Loaded ${venueItems.length} venues for entity: ${currentEntity.entityName}`);
            } catch (error) {
                console.error('Error fetching venues:', error);
            } finally {
                setVenuesLoading(false);
            }
        };
        fetchVenues();
    }, [client, currentEntity]);

    // Track which IDs have been tracked for the current entity
    useEffect(() => {
        if (!currentEntity) return;
        
        const ids = new Set<string>();
        Object.values(games).forEach((game: any) => {
            try {
                const gameUrl = new URL(game.id);
                const gameDomain = `${gameUrl.protocol}//${gameUrl.hostname}`;
                if (gameDomain === currentEntity.gameUrlDomain) {
                    const pathMatch = game.id.match(/id=(\d+)/);
                    if (pathMatch) {
                        ids.add(pathMatch[1]);
                    }
                }
            } catch {
                // Ignore invalid URLs
            }
        });
    }, [games, currentEntity]);
    
    // Effect to auto-select venue
    useEffect(() => {
        if (venues.length === 0) return;
        
        Object.values(games).forEach((game: any) => {
            const gameId = game.id;
            const autoAssignedId = game.data?.venueMatch?.autoAssignedVenue?.id;
            
            if (autoAssignedId && !selectedVenues[gameId]) {
                if (venues.some(v => v.id === autoAssignedId)) {
                    console.log(`[Auto-Assign] Automatically selecting venue ID: ${autoAssignedId} for game: ${gameId}`);
                    setSelectedVenues(prev => ({
                        ...prev,
                        [gameId]: autoAssignedId
                    }));
                }
            }
        });
    }, [games, venues, selectedVenues]);

    // --- ENHANCEMENT: useEffect to handle re-parse prop ---
    useEffect(() => {
        if (urlToReparse && currentEntity) {
            console.log(`[SingleScrapeTab] Received URL to re-parse: ${urlToReparse}`);
            
            // Extract the ID from the full URL
            const pathMatch = urlToReparse.match(/id=(\d+)/);
            if (pathMatch) {
                const tournamentId = pathMatch[1];
                setInputId(tournamentId); // Set the ID in the input field
                
                // Auto-trigger the tracking
                handleTrackGame(tournamentId, true); // Pass true to force refresh
                
                // Clear the re-parse request
                onReparseComplete();
            }
        }
    }, [urlToReparse, currentEntity]);

    // Check for S3 cache status when a game is tracked
    const checkCacheStatus = async (url: string) => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query GetScrapeURL($id: ID!) {
                        getScrapeURL(id: $id) {
                            id
                            latestS3Key
                            lastCacheHitAt
                            cachedContentUsedCount
                        }
                    }
                `,
                variables: { id: url }
            });
            
            if ('data' in response && response.data?.getScrapeURL) {
                const scrapeUrl = response.data.getScrapeURL;
                setCacheStatus(prev => ({
                    ...prev,
                    [url]: {
                        hasCache: !!scrapeUrl.latestS3Key,
                        s3Key: scrapeUrl.latestS3Key,
                        lastCached: scrapeUrl.lastCacheHitAt,
                        cacheHits: scrapeUrl.cachedContentUsedCount
                    }
                }));
            }
        } catch (error) {
            console.error('Error checking cache status:', error);
        }
    };

    /**
     * SMART TRACK NEXT: Uses gap analysis to find the next missing tournament ID
     * Priority order:
     * 1. First gap in the sequence (most likely to be an old tournament)
     * 2. If no gaps, highest ID + 1 (likely a new tournament)
     */
    const handleTrackNext = async () => {
        if (!currentEntity || !scrapingStatus) {
            console.log('[TrackNext] No entity or scraping status available');
            return;
        }
        
        setFindingNext(true);
        
        try {
            console.log('[TrackNext] Finding next untracked tournament...');
            
            let nextId: number | null = null;
            
            // Strategy 1: Find first gap (oldest missing tournaments)
            if (scrapingStatus.gaps && scrapingStatus.gaps.length > 0) {
                const firstGap = scrapingStatus.gaps[0];
                nextId = firstGap.start;
                console.log(`[TrackNext] Found gap starting at ID ${nextId}`);
            }
            // Strategy 2: No gaps, try highest + 1 (newest tournaments)
            else if (scrapingStatus.highestTournamentId) {
                nextId = scrapingStatus.highestTournamentId + 1;
                console.log(`[TrackNext] No gaps found, trying ID ${nextId} (highest + 1)`);
            }
            // Strategy 3: Start from 1 if no data at all
            else {
                nextId = 1;
                console.log('[TrackNext] No existing data, starting from ID 1');
            }
            
            if (nextId) {
                setInputId(nextId.toString());
                await handleTrackGame(nextId.toString());
            }
            
        } catch (error) {
            console.error('[TrackNext] Error finding next tournament:', error);
        } finally {
            setFindingNext(false);
        }
    };

    const handleTrackGame = async (idOrUrl: string, forceRefresh = false) => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }
        
        let url: string;
        let tournamentId: string;
        
        // Parse input: could be just ID or full URL
        if (idOrUrl.startsWith('http')) {
            url = idOrUrl;
            const match = url.match(/id=(\d+)/);
            if (!match) {
                alert('Invalid URL format. URL must contain "id=" parameter.');
                return;
            }
            tournamentId = match[1];
        } else {
            tournamentId = idOrUrl.trim();
            if (!/^\d+$/.test(tournamentId)) {
                alert('Please enter a valid tournament ID (numbers only)');
                return;
            }
            // Check if gameUrlPath already includes ?id= to avoid duplication
            if (currentEntity.gameUrlPath.includes('?id=')) {
                // gameUrlPath already has ?id=, just append the value
                url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${tournamentId}`;
            } else {
                // gameUrlPath doesn't have ?id=, add it
                url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${tournamentId}`;
            }
        }
        
        // Check if already tracked in this session
        if (trackedInSessionRef.current.has(tournamentId)) {
            console.log(`[SingleScraperTab] Tournament ${tournamentId} already tracked in this session`);
            return;
        }
        
        // Check cache status before tracking
        await checkCacheStatus(url);
        
        // Check if we should show scrape options modal
        try {
            const scrapeUrlResponse = await client.graphql({
                query: /* GraphQL */ `
                    query GetScrapeURL($id: ID!) {
                        getScrapeURL(id: $id) {
                            id
                            doNotScrape
                            gameStatus
                            latestS3Key
                        }
                    }
                `,
                variables: { id: url }
            });
            
            if ('data' in scrapeUrlResponse && scrapeUrlResponse.data?.getScrapeURL) {
                const scrapeUrl = scrapeUrlResponse.data.getScrapeURL;
                
                // If DO NOT SCRAPE or has warnings, show modal
                if (scrapeUrl.doNotScrape || scrapeUrl.gameStatus === 'FINISHED') {
                    let warningMessage = '';
                    if (scrapeUrl.doNotScrape) {
                        warningMessage = 'This tournament is marked as DO NOT SCRAPE.';
                    } else if (scrapeUrl.gameStatus === 'FINISHED') {
                        warningMessage = 'This tournament is already marked as FINISHED.';
                    }
                    
                    setScrapeModalInfo({
                        url,
                        entityId: currentEntity.id,
                        hasCache: !!scrapeUrl.latestS3Key,
                        doNotScrape: scrapeUrl.doNotScrape,
                        gameStatus: scrapeUrl.gameStatus,
                        warningMessage
                    });
                    return;
                }
            }
        } catch (error) {
            // No existing ScrapeURL record, proceed normally
            console.log('[SingleScraperTab] No existing ScrapeURL, proceeding with fresh scrape');
        }
        
        // Track the game
        await performTrackGame(url, tournamentId, forceRefresh);
    };

    const performTrackGame = async (url: string, tournamentId: string, forceRefresh = false) => {
        console.log(`[SingleScraperTab] Tracking game from URL: ${url} (forceRefresh: ${forceRefresh})`);
        
        if (!currentEntity?.id) {
            console.error('[SingleScraperTab] No entity ID available');
            return;
        }
        
        try {
            // trackGame signature: (url: string, source: DataSource, entityId: string, options?: TrackOptions)
            await trackGame(url, DataSource.SCRAPE, currentEntity.id, { forceRefresh });
            
            // Note: trackGame returns void, so we can't check for S3 cache status here
            // The S3 cache detection happens inside the trackGame function
            
            // Mark as tracked
            trackedInSessionRef.current.add(tournamentId);
            
            console.log(`[SingleScraperTab] Successfully tracked tournament ${tournamentId}`);
        } catch (error) {
            console.error('[SingleScraperTab] Error tracking game:', error);
            alert(`Failed to track tournament: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const handleScrapeFromModal = async (option: 'S3' | 'LIVE', _s3Key?: string) => {
        if (!scrapeModalInfo) return;
        
        const { url } = scrapeModalInfo;
        const match = url.match(/id=(\d+)/);
        const tournamentId = match ? match[1] : '';
        
        // 'S3' means use cache, 'LIVE' means force refresh
        const forceRefresh = option === 'LIVE';
        
        await performTrackGame(url, tournamentId, forceRefresh);
        setScrapeModalInfo(null);
    };

    const handleVenueChange = (gameUrl: string, venueId: string) => {
        setSelectedVenues(prev => ({
            ...prev,
            [gameUrl]: venueId
        }));
    };

    const handleSaveGame = async (gameUrl: string) => {
        const game = games[gameUrl];
        const venueId = selectedVenues[gameUrl];
        
        if (!venueId) {
            alert('Please select a venue before saving');
            return;
        }
        
        if (!currentEntity) {
            alert('No entity selected');
            return;
        }
        
        // Show confirmation modal
        setConfirmModalData({
            game,
            venueId,
            entityId: currentEntity.id
        });
    };

    const handleConfirmSave = async () => {
        if (!confirmModalData) return;
        
        const { game, venueId, entityId } = confirmModalData;
        
        try {
            await saveGame(game.id, venueId, entityId);
            
            // Remove from tracked games after successful save
            removeGame(game.id);
            
            // Remove from selected venues
            setSelectedVenues(prev => {
                const updated = { ...prev };
                delete updated[game.id];
                return updated;
            });
            
            // Reload gap analysis after save
            await loadGapAnalysis();
            
            console.log('[SingleScraperTab] Game saved successfully');
        } catch (error) {
            console.error('[SingleScraperTab] Error saving game:', error);
            alert(`Failed to save game: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setConfirmModalData(null);
        }
    };

    const handleCreateVenue = async (venueData: VenueFormData) => {
        try {
            // Calculate next venue number for this entity
            const maxVenueNumber = venues.reduce((max, v) => 
                v.venueNumber !== undefined && v.venueNumber > max ? v.venueNumber : max, 
                0
            );
            
            const input = {
                ...venueData,
                entityId: currentEntity?.id || '',
                isSpecial: false,
                venueNumber: maxVenueNumber + 1, // Auto-increment venue number
            };
            
            const response = await client.graphql({
                query: createVenue,
                variables: { input }
            }) as any;
            
            const newVenue = response.data.createVenue;
            
            // Add to venues list
            setVenues(prev => [...prev, newVenue].sort((a, b) => a.name.localeCompare(b.name)));
            
            // Auto-select for the game we were creating it for
            if (creatingVenueForGame) {
                setSelectedVenues(prev => ({
                    ...prev,
                    [creatingVenueForGame]: newVenue.id
                }));
            }
            
            // Close modal
            setVenueModalOpen(false);
            setCreatingVenueForGame(null);
            
            alert(`Venue "${newVenue.name}" created successfully!`);
        } catch (error) {
            console.error('Error creating venue:', error);
            alert(`Failed to create venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const getVenueBadgeColor = (game: any) => {
        const confidence = game.data?.venueMatch?.confidence || 0;
        if (confidence >= 90) return 'bg-green-100 text-green-800';
        if (confidence >= 70) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    // Filter entities to only show those accessible by the user
    const availableEntities = entities.filter(e => e.id === currentEntity?.id || !currentEntity);

    return (
        <div className="space-y-6">
            {/* Entity Selector */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-4">
                    <Building2 className="h-5 w-5 mr-2 text-blue-600" />
                    <h3 className="text-lg font-semibold">Entity Selection</h3>
                </div>
                <EntitySelector />
            </div>

            {/* Coverage Info */}
            {currentEntity && scrapingStatus && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow p-6 border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold flex items-center text-purple-900">
                            <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
                            {currentEntity.entityName} Coverage
                        </h3>
                        <button
                            onClick={loadGapAnalysis}
                            disabled={gapLoading}
                            className="text-sm text-purple-600 hover:text-purple-700"
                        >
                            {gapLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white bg-opacity-60 p-3 rounded">
                            <p className="text-xs text-gray-600">Total Games</p>
                            <p className="text-xl font-bold text-gray-900">{scrapingStatus.totalGamesStored}</p>
                        </div>
                        <div className="bg-white bg-opacity-60 p-3 rounded">
                            <p className="text-xs text-gray-600">Coverage</p>
                            <p className="text-xl font-bold text-green-600">{scrapingStatus.gapSummary.coveragePercentage.toFixed(1)}%</p>
                        </div>
                        <div className="bg-white bg-opacity-60 p-3 rounded">
                            <p className="text-xs text-gray-600">Missing</p>
                            <p className="text-xl font-bold text-orange-600">{scrapingStatus.gapSummary.totalMissingIds}</p>
                        </div>
                        <div className="bg-white bg-opacity-60 p-3 rounded">
                            <p className="text-xs text-gray-600">Gaps</p>
                            <p className="text-xl font-bold text-purple-600">{scrapingStatus.gapSummary.totalGaps}</p>
                        </div>
                    </div>
                    
                    {scrapingStatus.gaps.length > 0 && (
                        <p className="text-xs text-purple-700 mt-3">
                            💡 Use "Track Next" to automatically find and scrape the next missing tournament
                        </p>
                    )}
                </div>
            )}
            
            {/* Track Game Section */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Target className="h-5 w-5 mr-2 text-blue-600" />
                    Track Tournament
                </h3>
                
                {!currentEntity ? (
                    <p className="text-gray-500">Please select an entity to continue</p>
                ) : (
                    <>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Tournament ID or URL
                            </label>
                            <input
                                type="text"
                                value={inputId}
                                onChange={(e) => setInputId(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleTrackGame(inputId);
                                    }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter tournament ID (e.g., 12345) or full URL"
                            />
                        </div>
                        
                        <div className="flex space-x-3">
                            <button
                                onClick={handleTrackNext}
                                disabled={findingNext || !scrapingStatus}
                                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                            >
                                {findingNext ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Finding...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-1" />
                                        Track Next
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => handleTrackGame(inputId)}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                                Track
                            </button>
                        </div>
                        
                        <div className="text-sm text-gray-600 mt-3">
                            <p>Enter just the ID (e.g., "12345") or the full URL</p>
                            {currentEntity && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Base URL: {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
            
            {/* Tracked Games */}
            {Object.keys(games).length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center">
                            <FastForward className="h-5 w-5 mr-2 text-green-600" />
                            Tracked Games ({Object.keys(games).length})
                        </h3>
                        {venuesLoading && (
                            <span className="text-sm text-gray-500">Loading venues...</span>
                        )}
                    </div>
                    
                    <div className="space-y-4">
                        {Object.entries(games).map(([url, gameData]: [string, any]) => {
                            const cache = cacheStatus[url];
                            const venueMatch = gameData?.data?.venueMatch;
                            const autoVenue = venueMatch?.autoAssignedVenue;
                            const suggestions = venueMatch?.suggestions || [];
                            
                            return (
                                <div key={url} className="relative border rounded-lg p-4 hover:shadow-md transition-shadow">
                                    <GameListItem
                                        game={gameData}
                                        venues={venues}
                                        selectedVenueId={selectedVenues[url]}
                                        onVenueChange={(venueId: string) => handleVenueChange(url, venueId)}
                                        onSave={() => handleSaveGame(url)}
                                        onViewDetails={() => setSelectedGame(gameData)}
                                        onRemove={() => removeGame(url)}
                                        enableCreateVenue={true}
                                    />
                                    
                                    {/* S3 Cache Status Badge */}
                                    {cache?.hasCache && (
                                        <div className="absolute top-2 right-2 flex items-center gap-2">
                                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full flex items-center gap-1">
                                                <HardDrive className="w-3 h-3" />
                                                S3 Cached
                                                {cache.cacheHits && cache.cacheHits > 0 && ` (${cache.cacheHits} hits)`}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {/* Venue Match Info */}
                                    {venueMatch && (
                                        <div className="mt-3 pt-3 border-t">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    {autoVenue ? (
                                                        <div className="flex items-center space-x-2">
                                                            <span className={`px-2 py-1 text-xs rounded-full ${getVenueBadgeColor(gameData)}`}>
                                                                Auto-matched: {autoVenue.name} ({venueMatch.confidence}% confidence)
                                                            </span>
                                                        </div>
                                                    ) : suggestions.length > 0 ? (
                                                        <div className="text-sm">
                                                            <span className="text-gray-600">Suggestions: </span>
                                                            {suggestions.slice(0, 3).map((s: any, idx: number) => (
                                                                <span key={idx} className="ml-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                                                    {s.name} ({s.score}%)
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-red-600">No venue match found</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {gameData.data?.missingKeysFromScrape && gameData.data.missingKeysFromScrape.length > 0 && (
                                                <div className="mt-2 p-2 bg-yellow-50 rounded">
                                                    <p className="text-xs text-yellow-800">
                                                        Missing fields: {gameData.data.missingKeysFromScrape.join(', ')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            
            {/* Modals */}
            {scrapeModalInfo && (
                <ScrapeOptionsModal
                    isOpen={true}
                    onClose={() => setScrapeModalInfo(null)}
                    onSelectOption={handleScrapeFromModal}
                    url={scrapeModalInfo.url}
                    entityId={scrapeModalInfo.entityId}
                    doNotScrape={scrapeModalInfo.doNotScrape}
                    gameStatus={scrapeModalInfo.gameStatus}
                    warningMessage={scrapeModalInfo.warningMessage}
                />
            )}
            
            {selectedGame && (
                <GameDetailsModal
                    game={selectedGame}
                    onClose={() => setSelectedGame(null)}
                />
            )}
            
            {confirmModalData && (
                <SaveConfirmationModal
                    isOpen={true}
                    onClose={() => setConfirmModalData(null)}
                    onConfirm={handleConfirmSave}
                    gameData={confirmModalData.game.data}
                    venueId={confirmModalData.venueId}
                    sourceUrl={confirmModalData.game.id}
                />
            )}
            
            {/* Venue Modal */}
            <VenueModal
                isOpen={venueModalOpen}
                onClose={() => {
                    setVenueModalOpen(false);
                    setCreatingVenueForGame(null);
                }}
                onSave={handleCreateVenue}
                venue={null}
                entities={availableEntities}
            />
        </div>
    );
};