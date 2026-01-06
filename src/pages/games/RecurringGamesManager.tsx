// src/pages/games/RecurringGamesManager.tsx
// UPDATED: Uses selectedEntities instead of currentEntity for consistency with GameManagement
import React, { useState, useEffect, useMemo } from 'react';
import { 
    PlusIcon, 
    PencilSquareIcon, 
    NoSymbolIcon,
    CalendarIcon,
} from '@heroicons/react/24/outline';
import { useEntity } from '../../contexts/EntityContext';
import { 
    fetchRecurringGames, 
    createNewRecurringGame, 
    updateExistingRecurringGame,
    deactivateGame,
} from '../../services/recurringGameService';
import { RecurringGameForm } from '../../components/games/recurring-games/RecurringGameForm';
import { formatCurrency } from '../../utils/generalHelpers';

interface Venue {
    id: string;
    name: string;
    entityId?: string;
}

interface RecurringGamesManagerProps {
    venues: Venue[];
}

export const RecurringGamesManager: React.FC<RecurringGamesManagerProps> = ({ venues }) => {
    // FIX: Use selectedEntities for consistency with GameManagement (multi-entity view)
    const { selectedEntities, entities } = useEntity();
    const [games, setGames] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGame, setEditingGame] = useState<any | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // FIX: Load games when selectedEntities changes
    useEffect(() => {
        if (selectedEntities.length > 0) {
            loadGames();
        } else {
            setGames([]);
            setLoading(false);
        }
    }, [selectedEntities]);

    // FIX: Load games for ALL selected entities
    const loadGames = async () => {
        if (selectedEntities.length === 0) return;
        setLoading(true);
        try {
            const allGames: any[] = [];
            
            // Fetch recurring games for each selected entity
            for (const entity of selectedEntities) {
                try {
                    const data = await fetchRecurringGames(entity.id);
                    allGames.push(...data);
                } catch (entityErr) {
                    console.error(`Error fetching recurring games for entity ${entity.id}:`, entityErr);
                }
            }
            
            // Remove duplicates (in case a game appears multiple times)
            const uniqueGames = allGames.filter((game, index, self) => 
                index === self.findIndex(g => g.id === game.id)
            );
            
            setGames(uniqueGames);
        } catch (err) {
            console.error('Error loading recurring games:', err);
        } finally {
            setLoading(false);
        }
    };

    // FIX: Filter venues to only those belonging to selected entities
    const filteredVenues = useMemo(() => {
        const selectedEntityIds = new Set(selectedEntities.map(e => e.id));
        return venues.filter(v => v.entityId && selectedEntityIds.has(v.entityId));
    }, [venues, selectedEntities]);

    // Group Games by Venue
    const gamesByVenue = useMemo(() => {
        const groups: Record<string, any[]> = {};
        
        // Initialize groups for filtered venues (even empty ones won't show)
        filteredVenues.forEach(v => { groups[v.name] = []; });
        
        // Sort games into groups
        games.forEach(game => {
            const venue = filteredVenues.find(v => v.id === game.venueId);
            const venueName = venue ? venue.name : 'Unassigned / Unknown';
            if (!groups[venueName]) groups[venueName] = [];
            groups[venueName].push(game);
        });

        return groups;
    }, [games, filteredVenues]);

    // Handlers
    const handleCreate = () => {
        setEditingGame(null);
        setIsModalOpen(true);
    };

    const handleEdit = (game: any) => {
        setEditingGame(game);
        setIsModalOpen(true);
    };

    const handleDeactivate = async (gameId: string) => {
        if (!window.confirm('Are you sure you want to deactivate this recurring game?')) return;
        try {
            await deactivateGame(gameId, 'Manual deactivation from UI');
            await loadGames();
        } catch (err) {
            alert('Failed to deactivate game');
        }
    };

    const handleSubmit = async (formData: any) => {
        setIsSubmitting(true);
        try {
            if (editingGame) {
                // IMPORTANT: Pass _version for optimistic locking (DataStore sync)
                await updateExistingRecurringGame({
                    id: editingGame.id,
                    _version: editingGame._version,
                    ...formData
                });
            } else {
                await createNewRecurringGame({
                    ...formData,
                    wasManuallyCreated: true
                });
            }
            await loadGames();
            setIsModalOpen(false);
        } catch (err: any) {
            console.error(err);
            // Handle version conflict errors gracefully
            if (err?.errors?.[0]?.errorType === 'ConflictUnhandled' || 
                err?.message?.includes('version')) {
                alert('This record was modified by someone else. Please refresh and try again.');
                await loadGames();
            } else {
                alert('Failed to save game');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="p-8 text-center text-gray-500">
                Loading recurring games...
            </div>
        );
    }

    // No entities selected state
    if (selectedEntities.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500">Please select at least one entity to view recurring games.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                    Showing recurring games for {selectedEntities.length} {selectedEntities.length === 1 ? 'entity' : 'entities'}
                </div>
                <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                >
                    <PlusIcon className="h-4 w-4" />
                    New Recurring Game
                </button>
            </div>

            {/* List by Venue */}
            <div className="space-y-8">
                {Object.entries(gamesByVenue).map(([venueName, venueGames]) => {
                    if (venueGames.length === 0) return null;

                    return (
                        <div key={venueName} className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 shadow-sm overflow-hidden">
                            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b dark:border-gray-700 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-800 dark:text-gray-200">{venueName}</h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{venueGames.length} games</span>
                            </div>
                            
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Schedule</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Details</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                    {venueGames.map((game) => (
                                        <tr key={game.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                                <div className="flex items-center gap-2">
                                                    {game.name}
                                                    {game.isSignature && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                                            Signature
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                <div className="flex items-center gap-1">
                                                    <CalendarIcon className="h-4 w-4" />
                                                    {game.dayOfWeek} @ {game.startTime || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {game.gameVariant} • {formatCurrency(game.typicalBuyIn)}
                                                {game.typicalGuarantee > 0 && (
                                                    <span className="text-green-600 dark:text-green-400 ml-1">
                                                        ({formatCurrency(game.typicalGuarantee)} GTD)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                    game.isActive 
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                }`}>
                                                    {game.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button 
                                                    onClick={() => handleEdit(game)}
                                                    className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                                                    title="Edit"
                                                >
                                                    <PencilSquareIcon className="h-4 w-4" />
                                                </button>
                                                {game.isActive && (
                                                    <button 
                                                        onClick={() => handleDeactivate(game.id)}
                                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                        title="Deactivate"
                                                    >
                                                        <NoSymbolIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
                
                {/* Empty State */}
                {games.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                        <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No recurring games</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Get started by creating a new recurring game template.
                        </p>
                        <div className="mt-6">
                            <button
                                onClick={handleCreate}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                            >
                                <PlusIcon className="h-4 w-4" />
                                New Recurring Game
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            <RecurringGameForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={editingGame || undefined}
                venues={filteredVenues}
                entities={entities}
                currentEntityId={selectedEntities.length === 1 ? selectedEntities[0].id : undefined}
                isSubmitting={isSubmitting}
            />
        </div>
    );
};