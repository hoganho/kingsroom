// src/pages/scraper-admin-tabs/ManualTrackerTab_v2.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Target } from 'lucide-react';
import { useGameTracker } from '../../hooks/useGameTracker';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { Venue, DataSource } from '../../API';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { GameListItem } from '../../components/scraper/GameListItem';

export const ManualTrackerTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
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
    } | null>(null);

    // Fetch venues on load
    useEffect(() => {
        const fetchVenues = async () => {
            setVenuesLoading(true);
            try {
                const response = await client.graphql({ 
                    query: listVenuesForDropdown 
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
                console.log('[ManualTrackerTab] Loaded', venueItems.length, 'venues');
            } catch (error) {
                console.error('Error fetching venues:', error);
            } finally {
                setVenuesLoading(false);
            }
        };
        fetchVenues();
    }, [client]);
    
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
        if (id) {
            let trackId = id;
            if (!id.startsWith('http')) {
                trackId = `https://kingsroom.com.au/tournament/?id=${id}`;
            }
            trackGame(trackId, 'SCRAPE' as DataSource);
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        handleTrackGame(inputId);
    };

    const handleVenueChange = (gameId: string, venueId: string) => {
        console.log(`[ManualTrackerTab] Venue changed for game ${gameId}: ${venueId}`);
        setSelectedVenues(prev => ({ 
            ...prev, 
            [gameId]: venueId 
        }));
    };

    const handleSave = (gameId: string, venueId: string) => {
        const game = games[gameId];
        
        if (!game || !game.data || !venueId) {
            console.error('[ManualTrackerTab] Cannot save: Missing game data or venue');
            return;
        }
        
        console.log(`[ManualTrackerTab] Opening save modal for game: ${gameId} with venue: ${venueId}`);
        setConfirmModalData({ game, venueId });
    };

    // Handle save confirmation from modal
    const handleConfirmSave = () => {
        if (!confirmModalData) return;
        
        const { game, venueId } = confirmModalData;
        
        console.log(`[ManualTrackerTab] Confirming save for game: ${game.id} with venue: ${venueId}`);
        
        // Call saveGame with the game id and venue id
        saveGame(game.id, venueId);
        
        // Close the modal
        setConfirmModalData(null);
    };

    return (
        <div className="space-y-6">
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
                            placeholder="Enter Tournament URL or ID (e.g., 12345)..."
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Track
                        </button>
                    </div>
                </form>
                <p className="text-xs text-gray-500 mt-2">
                    Enter a tournament ID or full URL to start tracking
                </p>
            </div>

            {/* Tracked Games List */}
            <div className="space-y-3">
                <h3 className="text-lg font-semibold">Tracked Tournaments</h3>
                {Object.values(games).length > 0 ? (
                    <div className="space-y-2">
                        {Object.values(games).map((game: any) => (
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
                            No games are being tracked. Add a URL to begin.
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
                    sourceUrl={confirmModalData.game.id}
                />
            )}
        </div>
    );
};