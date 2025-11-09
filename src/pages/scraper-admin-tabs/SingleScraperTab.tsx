// src/pages/scraper-admin-tabs/SingleScraperTabEnhanced.tsx
// Enhanced version with S3 HTML support, cache status display, and modal

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Target, Building2, FastForward, HardDrive } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { useEntity, buildGameUrl } from '../../contexts/EntityContext';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';

export const SingleScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const { currentEntity } = useEntity();
    const [inputId, setInputId] = useState('');
    
    // Use enhanced tracker with S3 support
    const { 
        games, 
        trackGame, 
        saveGame, 
        removeGame 
    } = useGameTracker();
    
    const [selectedGame, setSelectedGame] = useState<any>(null);
    const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venuesLoading, setVenuesLoading] = useState(false);
    const [selectedVenues, setSelectedVenues] = useState<Record<string, string>>({});
    
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
        setTrackedIds(ids);
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
    }, [games, venues]);

    // Check cache status for a URL
    const checkCacheStatus = async (url: string) => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query GetScrapeURL($id: ID!) {
                        getScrapeURL(id: $id) {
                            latestS3Key
                            lastCacheHitAt
                            cachedContentUsedCount
                            contentHash
                            lastContentChangeAt
                        }
                    }
                `,
                variables: { id: url }
            });
            
            if ('data' in response && response.data?.getScrapeURL) {
                const data = response.data.getScrapeURL;
                setCacheStatus(prev => ({
                    ...prev,
                    [url]: {
                        hasCache: !!data.latestS3Key,
                        s3Key: data.latestS3Key,
                        lastCached: data.lastContentChangeAt,
                        cacheHits: data.cachedContentUsedCount || 0
                    }
                }));
            }
        } catch (error) {
            console.log('No cache status available');
        }
    };

    const handleTrackGame = (id: string) => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }

        if (id) {
            let trackUrl = id;
            
            // If just an ID was entered, build the full URL using entity config
            if (!id.startsWith('http')) {
                trackUrl = buildGameUrl(currentEntity, id);
                console.log(`[SingleScraperTab] Built URL for entity ${currentEntity.entityName}: ${trackUrl}`);
            } else {
                // Validate that the URL matches the current entity
                const urlDomain = new URL(id).origin;
                if (urlDomain !== currentEntity.gameUrlDomain) {
                    alert(`This URL doesn't match the selected entity (${currentEntity.entityName}). Please select the correct entity or enter just the game ID.`);
                    return;
                }
            }
            
            // Check cache status for the URL
            trackUrl && checkCacheStatus(trackUrl);
            
            // Show modal for scrape options
            setScrapeModalInfo({
                url: trackUrl,
                entityId: currentEntity.id
            });
        } else {
            alert('Please enter a game ID or URL');
        }
    };
    
    const handleScrapeFromModal = async (option: 'S3' | 'LIVE', s3Key?: string) => {
        if (!scrapeModalInfo) return;
        
        setScrapeModalInfo(null);
        
        // Map the modal option to DataSource enum
        // 'LIVE' means scrape from website, 'S3' means use cached data
        const dataSource = option === 'LIVE' ? DataSource.SCRAPE : DataSource.API;
        
        // TrackOptions from useGameTracker
        const options = {
            forceSource: option,
            s3Key: s3Key
        };
        
        // trackGame expects: (url: string, source: DataSource, entityId: string, options?: TrackOptions)
        await trackGame(
            scrapeModalInfo.url, 
            dataSource, 
            scrapeModalInfo.entityId,
            options
        );
        
        // Check cache status after scraping
        checkCacheStatus(scrapeModalInfo.url);
    };
    
    const handleVenueChange = (gameId: string, venueId: string) => {
        setSelectedVenues(prev => ({
            ...prev,
            [gameId]: venueId
        }));
    };
    
    const handleSaveGame = async (url: string) => {
        const gameData = games[url];
        if (!gameData || !gameData.data) return;
        
        const venueId = selectedVenues[url];
        
        if (!venueId || venueId === '') {
            alert('Please select a venue before saving');
            return;
        }
        
        // Show confirmation modal
        setConfirmModalData({
            game: gameData,
            venueId,
            entityId: currentEntity?.id || ''
        });
    };
    
    const handleConfirmSave = async () => {
        if (!confirmModalData) return;
        
        const { game, venueId, entityId } = confirmModalData;
        
        try {
            // saveGame expects (gameId, venueId, entityId)
            await saveGame(game.id, venueId, entityId);
            
            // After successful save
            setConfirmModalData(null);
            removeGame(game.id);
            setSelectedVenues(prev => {
                const newVenues = { ...prev };
                delete newVenues[game.id];
                return newVenues;
            });
            
            // Track the ID as saved
            const pathMatch = game.id.match(/id=(\d+)/);
            if (pathMatch) {
                setTrackedIds(prev => new Set([...prev, pathMatch[1]]));
            }
        } catch (error) {
            console.error('Error saving game:', error);
            alert('Failed to save game. See console for details.');
        }
    };

    const getVenueBadgeColor = (gameData: any) => {
        const match = gameData?.data?.venueMatch;
        if (!match) return 'bg-gray-100 text-gray-800';
        
        if (match.autoAssignedVenue) {
            const confidence = match.confidence || 0;
            if (confidence >= 90) return 'bg-green-100 text-green-800';
            if (confidence >= 70) return 'bg-yellow-100 text-yellow-800';
            return 'bg-orange-100 text-orange-800';
        }
        
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="space-y-6">
            {/* Entity Selection */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                        <Building2 className="h-5 w-5 mr-2 text-blue-600" />
                        Entity Selection
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                        Select the entity (business) you want to scrape games for
                    </p>
                </div>
                <EntitySelector />
                {currentEntity && (
                    <div className="mt-3 p-3 bg-blue-50 rounded">
                        <p className="text-sm text-blue-800">
                            <strong>Active:</strong> {currentEntity.entityName}
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                            Base URL: {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Manual Scraping */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Target className="h-5 w-5 mr-2 text-blue-600" />
                    Single Tournament Scraper
                </h3>
                
                {!currentEntity ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800">Please select an entity first to enable scraping.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={inputId}
                                onChange={(e) => setInputId(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleTrackGame(inputId)}
                                placeholder="Enter tournament ID (e.g., 12345) or full URL"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                                onClick={() => handleTrackGame(inputId)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                                Track Game
                            </button>
                        </div>
                        
                        <div className="mt-2 text-sm text-gray-600">
                            <p>Enter just the ID (e.g., "12345") or the full URL</p>
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
                            const pathMatch = url.match(/id=(\d+)/);
                            const gameIdNumber = pathMatch ? pathMatch[1] : null;
                            
                            return (
                                <div key={url} className="relative border rounded-lg p-4 hover:shadow-md transition-shadow">
                                    <GameListItem
                                        game={gameData}
                                        venues={venues}
                                        selectedVenueId={selectedVenues[url]}
                                        onVenueChange={(venueId) => handleVenueChange(url, venueId)}
                                        onSave={() => handleSaveGame(url)}
                                        onViewDetails={() => setSelectedGame(gameData)}
                                        onRemove={() => removeGame(url)}
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
                                    
                                    {/* Additional indicator if already in database */}
                                    {trackedIds.has(gameIdNumber || '') && (
                                        <div className="mt-2 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded inline-block">
                                            Already in database
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
        </div>
    );
};