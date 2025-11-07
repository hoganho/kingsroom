// src/pages/scraper-admin-tabs/SingleScraperTab.tsx
// Entity-aware version of SingleScraperTab

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Target, Building2 } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { useEntity, buildGameUrl } from '../../contexts/EntityContext';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import { EntitySelector } from '../../components/entities/EntitySelector';

export const SingleScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    // FIX 1: Removed 'entities' as it was unused
    const { currentEntity } = useEntity();
    const [inputId, setInputId] = useState('');
    const { games, trackGame, saveGame, removeGame, refreshGame } = useGameTracker();
    const [selectedGame, setSelectedGame] = useState<any>(null);
    
    // State for venues and selection
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venuesLoading, setVenuesLoading] = useState(false);
    const [selectedVenues, setSelectedVenues] = useState<Record<string, string>>({});
    
    // State for the save confirmation modal
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
    
    // Effect to auto-select venue
    useEffect(() => {
        if (venues.length === 0) return;
        
        Object.values(games).forEach((game: any) => {
            const gameId = game.id;
            const autoAssignedId = game.data?.venueMatch?.autoAssignedVenue?.id;
            
            // Check if we should auto-select a venue for this game
            if (autoAssignedId && !selectedVenues[gameId]) {
                // Verify the venue exists in our list
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
            
            // Track with entity context
            trackGame(trackUrl, 'SCRAPE' as DataSource, currentEntity.id);
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        handleTrackGame(inputId);
    };

    const handleVenueChange = (gameId: string, venueId: string) => {
        console.log(`[SingleScraperTab] Venue changed for game ${gameId}: ${venueId}`);
        setSelectedVenues(prev => ({ 
            ...prev, 
            [gameId]: venueId 
        }));
    };

    const handleSave = (gameId: string, venueId: string) => {
        const game = games[gameId];
        
        if (!game || !game.data || !venueId || !currentEntity) {
            console.error('[SingleScraperTab] Cannot save: Missing game data, venue, or entity');
            return;
        }
        
        console.log(`[SingleScraperTab] Opening save modal for game: ${gameId} with venue: ${venueId} and entity: ${currentEntity.id}`);
        setConfirmModalData({ game, venueId, entityId: currentEntity.id });
    };

    // Handle save confirmation from modal
    const handleConfirmSave = () => {
        if (!confirmModalData) return;
        
        const { game, venueId, entityId } = confirmModalData;
        
        console.log(`[SingleScraperTab] Confirming save for game: ${game.id} with venue: ${venueId} and entity: ${entityId}`);
        
        // Call saveGame with the game id, venue id, and entity id
        saveGame(game.id, venueId, entityId);
        
        // Close the modal
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
                    {/* FIX 2: Removed 'showLabel' prop */}
                    <EntitySelector />
                </div>
            </div>

            {/* Input Form */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Track Tournament</h3>
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={inputId}
                            onChange={(e) => setInputId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={`Enter Tournament ID (e.g., 12345) for ${currentEntity.entityName}...`}
                        />
                        <button
                            type="submit"
                            disabled={!currentEntity}
                            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300"
                        >
                            Track
                        </button>
                    </div>
                </form>
                <p className="text-xs text-gray-500 mt-2">
                    Enter just the tournament ID. The URL will be built using {currentEntity.entityName}'s pattern.
                </p>
            </div>

            {/* Tracked Games List */}
            <div className="space-y-3">
                <h3 className="text-lg font-semibold">Tracked Tournaments for {currentEntity.entityName}</h3>
                {Object.values(games).length > 0 ? (
                    <div className="space-y-2">
                        {Object.values(games)
                            .filter((game: any) => {
                                // Filter games by current entity
                                try {
                                    const gameUrl = new URL(game.id);
                                    const gameDomain = `${gameUrl.protocol}//${gameUrl.hostname}`;
                                    return gameDomain === currentEntity.gameUrlDomain;
                                } catch {
                                    return false;
                                }
                            })
                            .map((game: any) => (
                                <GameListItem
                                    key={game.id}
                                    game={game}
                                    venues={venues}
                                    venuesLoading={venuesLoading}
                                    selectedVenueId={selectedVenues[game.id]}
                                    onVenueChange={handleVenueChange}
                                    onSave={handleSave}
                                    onRemove={removeGame}
                                    onRefresh={refreshGame}
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
                            No games are being tracked for {currentEntity.entityName}. Add a tournament ID to begin.
                        </p>
                    </div>
                )}
            </div>

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
                    // FIX 3: Removed 'entityId' prop
                    sourceUrl={confirmModalData.game.id}
                />
            )}
        </div>
    );
};