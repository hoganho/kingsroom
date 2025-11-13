// src/pages/scraper-admin-tabs/SingleScraperTab.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Target, FastForward, HardDrive, ChevronRight } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { useEntity, buildGameUrl } from '../../contexts/EntityContext';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { listGames } from '../../graphql/queries';
import { createVenue } from '../../graphql/mutations';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';
import { VenueModal } from '../../components/venues/VenueModal';
import { VenueFormData } from '../../types/venue';

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
                
                // Automatically run the tracking logic
                // We must use the 'id' (tournamentId) not the full URL
                handleTrackGame(tournamentId); 
            } else {
                console.warn(`[SingleScrapeTab] Could not parse tournament ID from URL: ${urlToReparse}`);
            }
            
            // Clear the prop in the parent component
            onReparseComplete();
        }
    }, [urlToReparse, onReparseComplete, currentEntity]); // handleTrackGame is a useCallback, but it's not stable, so we omit it


    // Handle venue change
    const handleVenueChange = (gameId: string, venueId: string) => {
        // Special handling for "create_new" option
        if (venueId === 'create_new') {
            setCreatingVenueForGame(gameId);
            setVenueModalOpen(true);
            return;
        }
        
        setSelectedVenues(prev => ({
            ...prev,
            [gameId]: venueId
        }));
        console.log(`[Venue Change] Game ${gameId} -> Venue ${venueId}`);
    };

    // Handle venue creation - get next venue number
    const getNextVenueNumber = (): number => {
        const venueNumbers = venues
            .map(v => v.venueNumber)
            .filter((num): num is number => num !== undefined && num !== null);
        
        if (venueNumbers.length === 0) return 1;
        return Math.max(...venueNumbers) + 1;
    };

    // Handle venue creation
    const handleCreateVenue = async (venueData: VenueFormData) => {
        if (!currentEntity) {
            console.error('No current entity selected');
            return;
        }

        try {
            // If no entityId is provided in the form, use the current entity
            const entityId = venueData.entityId || currentEntity.id;
            const nextVenueNumber = getNextVenueNumber();
            
            const response = await client.graphql({
                query: createVenue,
                variables: {
                    input: {
                        name: venueData.name,
                        venueNumber: nextVenueNumber, // Add the required venue number
                        address: venueData.address || null,
                        city: venueData.city || null,
                        country: venueData.country || 'Australia',
                        aliases: venueData.aliases?.filter(Boolean) || [],
                        entityId: entityId,
                        isSpecial: false
                    }
                }
            }) as any;
            
            const newVenue = response.data.createVenue;
            console.log('[Venue Created]', newVenue);
            
            // Add new venue to the list
            setVenues(prev => [...prev, newVenue].sort((a, b) => {
                if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
                    return a.venueNumber - b.venueNumber;
                }
                return a.name.localeCompare(b.name);
            }));
            
            // If we were creating for a specific game, auto-select the new venue
            if (creatingVenueForGame) {
                setSelectedVenues(prev => ({
                    ...prev,
                    [creatingVenueForGame]: newVenue.id
                }));
            }
            
            // Close modal and reset state
            setVenueModalOpen(false);
            setCreatingVenueForGame(null);
        } catch (error) {
            console.error('Error creating venue:', error);
            alert('Failed to create venue. Please try again.');
        }
    };

    // Get venue badge color based on match confidence
    const getVenueBadgeColor = (game: any) => {
        const confidence = game.data?.venueMatch?.confidence || 0;
        if (confidence >= 80) return 'bg-green-100 text-green-800';
        if (confidence >= 60) return 'bg-yellow-100 text-yellow-800';
        return 'bg-orange-100 text-orange-800';
    };

    // Handle tracking a game - FIXED to show modal when cache exists
    const handleTrackGame = async (id: string) => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }
        
        const url = buildGameUrl(currentEntity, id);
        console.log('[Track] Starting to track:', url);
        
        // Track in session
        const pathMatch = url.match(/id=(\d+)/);
        if (pathMatch) {
            trackedInSessionRef.current.add(pathMatch[1]);
        }
        
        // Check if game exists in DB first
        let existingGameStatus = null;
        try {
            const checkResponse = await client.graphql({
                query: listGames,
                variables: {
                    filter: {
                        sourceUrl: { eq: url }
                    },
                    limit: 1
                }
            }) as any;
            
            const existingGame = checkResponse.data?.listGames?.items?.[0];
            if (existingGame) {
                console.log('[Track] Game exists in database:', existingGame.id);
                console.log('[Track] Game status:', existingGame.gameStatus);
                console.log('[Track] DoNotScrape:', existingGame.doNotScrape);
                existingGameStatus = existingGame.gameStatus;
            }
        } catch (error) {
            console.error('[Track] Error checking existing game:', error);
        }
        
        // Check cache status and scrapeURL info
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query GetScrapeURL($id: ID!) {
                        getScrapeURL(id: $id) {
                            id
                            latestS3Key
                            lastCacheHitAt
                            cachedContentUsedCount
                            contentHash
                            lastContentChangeAt
                            lastScrapedAt
                            doNotScrape
                            status
                            lastScrapeStatus
                        }
                    }
                `,
                variables: { id: url }
            }) as any;
            
            const scrapeURLData = response.data?.getScrapeURL;
            
            if (scrapeURLData) {
                console.log('[Track] ScrapeURL data:', {
                    doNotScrape: scrapeURLData.doNotScrape,
                    latestS3Key: scrapeURLData.latestS3Key,
                    lastScrapeStatus: scrapeURLData.lastScrapeStatus
                });
                
                // Update cache status state
                setCacheStatus(prev => ({
                    ...prev,
                    [url]: {
                        hasCache: !!scrapeURLData.latestS3Key,
                        s3Key: scrapeURLData.latestS3Key,
                        lastCached: scrapeURLData.lastScrapedAt,
                        cacheHits: scrapeURLData.cachedContentUsedCount || 0,
                        doNotScrape: scrapeURLData.doNotScrape
                    }
                }));
                
                // CRITICAL LOGIC FOR MODAL DISPLAY:
                const isSpecialStatus = existingGameStatus === 'NOT_PUBLISHED' || 
                                        existingGameStatus === 'NOT_IN_USE' ||
                                        existingGameStatus === 'NOT_FOUND';
                
                const shouldShowModal = !!(
                    scrapeURLData.latestS3Key || // Has cache
                    scrapeURLData.doNotScrape ||   // Marked as do not scrape
                    isSpecialStatus             // Special status tournament
                );
                
                if (shouldShowModal) {
                    console.log('[Track] Showing modal for user choice:', {
                        reason: scrapeURLData.latestS3Key ? 'Has cache' : 
                                scrapeURLData.doNotScrape ? 'DoNotScrape is true' :
                                'Special status tournament'
                    });
                    
                    // Store additional context for the modal
                    setScrapeModalInfo({
                        url: url,
                        entityId: currentEntity.id,
                        hasCache: !!scrapeURLData.latestS3Key,
                        doNotScrape: scrapeURLData.doNotScrape,
                        gameStatus: existingGameStatus,
                        warningMessage: scrapeURLData.doNotScrape ?
                            `This tournament is marked as "Do Not Scrape" (Status: ${existingGameStatus || 'Unknown'}). ` +
                            `You can still force a scrape if needed.` : undefined
                    });
                    
                    return; // Wait for user's choice in modal
                }
            }
            
            // No special conditions, proceed with normal scrape
            console.log('[Track] No special conditions, proceeding with normal scrape');
            
        } catch (error) {
            console.log('[Track] Error checking cache/scrapeURL, proceeding normally:', error);
        }
        
        // Only reach here if no modal needs to be shown
        trackGame(url, DataSource.SCRAPE, currentEntity.id);
    };

    // Handle tracking next game
    const handleTrackNext = async () => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }

        setFindingNext(true);

        try {
            // Get all tracked IDs (from session, not just visible)
            const allTrackedIds = Array.from(trackedInSessionRef.current)
                .map(id => parseInt(id))
                .filter(id => !isNaN(id));

            if (allTrackedIds.length === 0) {
                alert('Please track at least one game first to find the next one');
                return;
            }

            const highestId = Math.max(...allTrackedIds);
            const nextId = highestId + 1;
            const nextIdStr = nextId.toString();
            const url = buildGameUrl(currentEntity, nextIdStr);

            console.log(`[Track Next] Attempting to track single ID: ${nextId}`);

            // 1. Check if this ID (as a URL) already exists in our database
            try {
                const gameCheck = await client.graphql({
                    query: listGames,
                    variables: {
                        filter: { sourceUrl: { eq: url } },
                        limit: 1
                    }
                }) as any;

                // If game exists, don't scrape. Just set input to the next one.
                if (gameCheck.data?.listGames?.items?.length > 0) {
                    console.log(`[Track Next] ID ${nextId} already exists in database. Skipping scrape.`);
                    alert(`ID ${nextId} already exists in the database. No scrape initiated.`);
                    setInputId((nextId + 1).toString()); // Ready for the next click
                    return;
                }
            } catch (error) {
                console.error('[Track Next] Error checking game existence:', error);
            }

            // 2. Call handleTrackGame with the new ID.
            console.log(`[Track Next] Calling handleTrackGame for ID ${nextIdStr}`);
            await handleTrackGame(nextIdStr);

            // 3. Set the input box to the *next* ID, ready for the user's next click
            setInputId((nextId + 1).toString());

        } catch (error) {
            console.error('[Track Next] Error finding next game:', error);
        } finally {
            setFindingNext(false);
        }
    };

    // Handle save game - FIXED to match expected signature
    const handleSaveGame = async (url: string) => {
        const venueId = selectedVenues[url];
        if (!venueId || !currentEntity) {
            alert('Please select both an entity and a venue');
            return;
        }
        
        const gameData = games[url];
        setConfirmModalData({
            game: gameData,
            venueId: venueId,
            entityId: currentEntity.id
        });
    };

    const handleConfirmSave = async () => {
        if (!confirmModalData) return;
        
        const { game, venueId, entityId } = confirmModalData;
        // Call saveGame with correct signature (gameId, venueId, entityId)
        await saveGame(game.id, venueId, entityId);
        setConfirmModalData(null);
    };

    // Handle scrape from modal - Enhanced to use cache info
    const handleScrapeFromModal = (option: 'S3' | 'LIVE' | 'CANCEL') => {
        if (!scrapeModalInfo || !option || option === 'CANCEL') {
            setScrapeModalInfo(null);
            return;
        }
        
        const { url, entityId, hasCache = false, doNotScrape = false } = scrapeModalInfo;
        const cachedData = cacheStatus[url];
        
        console.log(`[Modal] User selected: ${option}`);
        console.log(`[Modal] Context:`, { hasCache, doNotScrape, cachedData });
        
        setScrapeModalInfo(null);
        
        if (option === 'S3' && cachedData?.s3Key) {
            // User chose to use cached data
            console.log('[Modal] Using cached S3 data:', cachedData.s3Key);
            trackGame(url, DataSource.SCRAPE, entityId, { 
                forceSource: 'S3',
                s3Key: cachedData.s3Key,
                forceRefresh: false
            });
        } else if (option === 'LIVE') {
            // User chose to force a fresh scrape
            console.log('[Modal] User forcing fresh scrape', {
                doNotScrape,
                reason: doNotScrape ? 'Overriding doNotScrape flag' : 'User preference'
            });
            
            trackGame(url, DataSource.SCRAPE, entityId, { 
                forceSource: 'LIVE',
                forceRefresh: true
            });
        }
    };

    // Filter entities for dropdown
    const availableEntities = entities || [];

    return (
        <div className="space-y-6 px-4">
            {/* Entity Selector */}
            <EntitySelector />
            
            {/* Single ID Tracker */}
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold flex items-center mb-4">
                    <Target className="h-5 w-5 mr-2 text-blue-600" />
                    Single Tournament Tracker
                </h2>
                
                {!currentEntity ? (
                    <div className="text-gray-500">Please select an entity to begin tracking</div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <input
                                type="text"
                                value={inputId}
                                onChange={(e) => setInputId(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (e.shiftKey) {
                                            handleTrackNext();
                                        } else {
                                            handleTrackGame(inputId);
                                        }
                                    }
                                }}
                                placeholder="Enter tournament ID or URL"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            
                            {/* Buttons under the input */}
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleTrackNext}
                                    disabled={findingNext}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Find and track the next sequential ID"
                                >
                                    {findingNext ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 mr-1" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Finding...
                                        </>
                                    ) : (
                                        <>
                                            <ChevronRight className="h-4 w-4 mr-1" />
                                            Track Next
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleTrackGame(inputId)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    Track
                                </button>
                            </div>
                            
                            <div className="text-sm text-gray-600">
                                <p>Enter just the ID (e.g., "12345") or the full URL</p>
                                {currentEntity && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Base URL: {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}
                                    </p>
                                )}
                            </div>
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