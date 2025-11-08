// src/pages/scraper-admin-tabs/BulkScraperTabEnhanced.tsx
// Enhanced version with S3 HTML support for bulk scraping

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Database, Target, Building2, AlertCircle, Globe } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { useEntity, buildGameUrl } from '../../contexts/EntityContext';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';

export const BulkScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    
    // Entity and Game State
    const { currentEntity } = useEntity();
    const { 
        games, 
        trackGame, 
        saveGame, 
        removeGame, 
        refreshGame 
    } = useGameTracker();
    
    // Form State
    const [startId, setStartId] = useState('');
    const [endId, setEndId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [useS3ByDefault, setUseS3ByDefault] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(true);
    
    // Bulk tracking state
    const [bulkTrackingQueue, setBulkTrackingQueue] = useState<string[]>([]);
    const [currentTrackingUrl, setCurrentTrackingUrl] = useState<string | null>(null);
    const [bulkSource, setBulkSource] = useState<'S3' | 'LIVE' | null>(null);
    
    // Modals
    const [selectedGame, setSelectedGame] = useState<any>(null);
    const [confirmModalData, setConfirmModalData] = useState<{
        game: any;
        venueId: string;
        entityId: string;
    } | null>(null);
    
    // Modal for individual game refresh
    const [scrapeModalInfo, setScrapeModalInfo] = useState<{
        url: string;
        entityId: string;
    } | null>(null);
    
    // Venues
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venuesLoading, setVenuesLoading] = useState(false);
    const [selectedVenues, setSelectedVenues] = useState<Record<string, string>>({});

    // Fetch venues filtered by entity
    useEffect(() => {
        if (!currentEntity) {
            setVenues([]);
            return;
        }
        
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
                console.log(`[BulkScraperTab] Loaded ${venueItems.length} venues for entity: ${currentEntity.entityName}`);
            } catch (error) {
                console.error('Error fetching venues:', error);
            } finally {
                setVenuesLoading(false);
            }
        };
        fetchVenues();
    }, [client, currentEntity]);
    
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

    // Process bulk tracking queue
    useEffect(() => {
        if (bulkTrackingQueue.length > 0 && bulkSource && !currentTrackingUrl) {
            const nextUrl = bulkTrackingQueue[0];
            setCurrentTrackingUrl(nextUrl);
            
            // Track the game with selected source
            trackGame(nextUrl, 'SCRAPE' as DataSource, currentEntity!.id, { forceSource: bulkSource });
            
            // Remove from queue
            setBulkTrackingQueue(prev => prev.slice(1));
            
            // Clear current after a delay
            setTimeout(() => {
                setCurrentTrackingUrl(null);
            }, 500);
        }
    }, [bulkTrackingQueue, bulkSource, currentTrackingUrl, trackGame, currentEntity]);

    // Handle form submission to track a range of games
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!currentEntity) {
            setError('Please select an entity first');
            return;
        }
        
        const start = parseInt(startId, 10);
        const end = parseInt(endId, 10);

        if (isNaN(start) || isNaN(end) || start > end) {
            setError('Please enter valid start and end IDs where start ≤ end');
            return;
        }
        
        // Build URLs for the range
        const urls: string[] = [];
        for (let id = start; id <= end; id++) {
            const gameIdStr = id.toString();
            const trackUrl = buildGameUrl(currentEntity, gameIdStr);
            urls.push(trackUrl);
        }
        
        console.log(`[BulkScraperTab] Preparing to track ${urls.length} games for entity ${currentEntity.entityName}`);
        
        // Set up the queue
        setBulkTrackingQueue(urls);
        
        // Clear inputs
        setStartId('');
        setEndId('');
    };

    // Handle source selection for bulk tracking
    const handleBulkSourceSelection = (source: 'S3' | 'LIVE') => {
        setBulkSource(source);
        setShowSourceModal(false);
    };

    // Handle individual game refresh
    const handleRefreshGame = (gameId: string) => {
        if (!currentEntity) return;
        
        setScrapeModalInfo({
            url: gameId,
            entityId: currentEntity.id
        });
    };

    const handleScrapeOptionSelected = (option: 'S3' | 'LIVE') => {
        if (!scrapeModalInfo) return;
        
        refreshGame(scrapeModalInfo.url, { forceSource: option });
        setScrapeModalInfo(null);
    };

    // Other handlers remain the same
    const handleVenueChange = (gameId: string, venueId: string) => {
        console.log(`[BulkScraperTab] Venue changed for game ${gameId}: ${venueId}`);
        setSelectedVenues(prev => ({ 
            ...prev, 
            [gameId]: venueId 
        }));
    };

    const handleSave = (gameId: string, venueId: string) => {
        const game = games[gameId];
        
        if (!game || !game.data || !venueId || !currentEntity) {
            console.error('[BulkScraperTab] Cannot save: Missing game data, venue, or entity');
            return;
        }
        
        console.log(`[BulkScraperTab] Opening save modal for game: ${gameId} with venue: ${venueId} and entity: ${currentEntity.id}`);
        setConfirmModalData({ game, venueId, entityId: currentEntity.id });
    };

    const handleConfirmSave = () => {
        if (!confirmModalData) return;
        
        const { game, venueId, entityId } = confirmModalData;
        console.log(`[BulkScraperTab] Confirming save for game: ${game.id} with venue: ${venueId} and entity: ${entityId}`);
        
        saveGame(game.id, venueId, entityId);
        setConfirmModalData(null);
    };

    // Show entity selector if no entity is selected
    if (!currentEntity) {
        return (
            <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No Entity Selected</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Please select an entity to start tracking tournaments.
                        </p>
                        <div className="mt-6 flex justify-center">
                            <EntitySelector />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Filter games to show only those matching the current entity's domain
    const filteredGames = Object.values(games).filter((game: any) => {
        try {
            const gameUrl = new URL(game.id);
            const gameDomain = `${gameUrl.protocol}//${gameUrl.hostname}`;
            return gameDomain === currentEntity.gameUrlDomain;
        } catch {
            return false;
        }
    });

    return (
        <div className="space-y-6">
            {/* Entity Info Bar */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Building2 className="h-5 w-5 text-blue-500" />
                        <div>
                            <p className="text-sm font-medium text-blue-900">
                                Current Entity: {currentEntity.entityName}
                            </p>
                            <p className="text-xs text-blue-700 font-mono">
                                URL Pattern: {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}[ID]
                            </p>
                        </div>
                    </div>
                    <EntitySelector />
                </div>
            </div>

            {/* Input Form */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Track Tournament Range</h3>
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex items-center space-x-2">
                        <input
                            type="number"
                            value={startId}
                            onChange={(e) => setStartId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="Start ID (e.g., 1)"
                            disabled={!currentEntity || bulkTrackingQueue.length > 0}
                        />
                        <span className="text-gray-500">to</span>
                        <input
                            type="number"
                            value={endId}
                            onChange={(e) => setEndId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="End ID (e.g., 100)"
                            disabled={!currentEntity || bulkTrackingQueue.length > 0}
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                            disabled={!currentEntity || bulkTrackingQueue.length > 0}
                        >
                            <Database className="h-4 w-4" />
                            <span>Track Range</span>
                        </button>
                    </div>
                </form>
                
                {error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                        {error}
                    </div>
                )}
                
                {/* Bulk tracking progress */}
                {bulkTrackingQueue.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex items-center space-x-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm text-yellow-900">
                                Processing bulk tracking: {bulkTrackingQueue.length} remaining
                            </span>
                        </div>
                    </div>
                )}
                
                {/* Source preference toggle */}
                <div className="mt-4 flex items-center space-x-3">
                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={useS3ByDefault}
                            onChange={(e) => setUseS3ByDefault(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">
                            Prefer S3 HTML when available
                        </span>
                    </label>
                    {bulkSource && (
                        <span className="text-xs text-gray-500">
                            (Currently using: {bulkSource})
                        </span>
                    )}
                </div>
            </div>

            {/* Tracked Games List */}
            <div className="space-y-3">
                <h3 className="text-lg font-semibold">Tracked Tournaments for {currentEntity.entityName}</h3>
                {filteredGames.length > 0 ? (
                    <div className="space-y-2">
                        {filteredGames.map((game: any) => (
                            <GameListItem
                                key={game.id}
                                game={game}
                                venues={venues}
                                venuesLoading={venuesLoading}
                                selectedVenueId={selectedVenues[game.id]}
                                onVenueChange={handleVenueChange}
                                onSave={handleSave}
                                onRemove={removeGame}
                                onRefresh={handleRefreshGame}
                                onViewDetails={setSelectedGame}
                                mode="manual"
                                showVenueSelector={true}
                                showActions={true}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow p-10 text-center">
                        <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">
                            No games are being tracked for {currentEntity.entityName}. 
                            Add a tournament ID range to begin.
                        </p>
                    </div>
                )}
            </div>

            {/* Bulk Source Selection Modal */}
            {showSourceModal && bulkTrackingQueue.length > 0 && (
                <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                        <h3 className="text-lg font-semibold mb-4">
                            Select Data Source for Bulk Tracking
                        </h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Choose how to fetch data for {bulkTrackingQueue.length} tournaments:
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={() => handleBulkSourceSelection('S3')}
                                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center space-x-2"
                            >
                                <Database className="h-4 w-4" />
                                <span>Use S3 HTML (when available)</span>
                            </button>
                            <button
                                onClick={() => handleBulkSourceSelection('LIVE')}
                                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center space-x-2"
                            >
                                <Globe className="h-4 w-4" />
                                <span>Scrape Live Pages</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Scrape Options Modal */}
            {scrapeModalInfo && (
                <ScrapeOptionsModal
                    isOpen={true}
                    onClose={() => setScrapeModalInfo(null)}
                    onSelectOption={handleScrapeOptionSelected}
                    url={scrapeModalInfo.url}
                    entityId={scrapeModalInfo.entityId}
                />
            )}

            {/* Game Details Modal */}
            {selectedGame && (
                <GameDetailsModal 
                    game={selectedGame} 
                    onClose={() => setSelectedGame(null)} 
                />
            )}

            {/* Save Confirmation Modal */}
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