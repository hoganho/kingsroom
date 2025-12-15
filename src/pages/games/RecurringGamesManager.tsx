// src/pages/games/RecurringGamesManager.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
    PlusIcon, 
    PencilSquareIcon, 
    NoSymbolIcon,
    CalendarIcon,
    WrenchScrewdriverIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { useEntity } from '../../contexts/EntityContext';
import { 
    fetchRecurringGames, 
    createNewRecurringGame, 
    updateExistingRecurringGame,
    deactivateGame,
    backfillMissingCompositeKeys,
} from '../../services/recurringGameService';
import { RecurringGameForm } from '../../components/games/recurring-games/RecurringGameForm';
import { formatCurrency } from '../../utils/generalHelpers';

// You might need to import Venue type from your types/game or define locally
interface Venue {
    id: string;
    name: string;
}

interface BackfillResult {
    fixed: number;
    skipped: number;
    errors: string[];
}

interface RecurringGamesManagerProps {
    venues: Venue[]; // Passed from parent (GameManagement)
}

export const RecurringGamesManager: React.FC<RecurringGamesManagerProps> = ({ venues }) => {
    const { currentEntity, entities } = useEntity();
    const [games, setGames] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGame, setEditingGame] = useState<any | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Backfill State
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
    const [showBackfillResult, setShowBackfillResult] = useState(false);

    // Data Loading
    useEffect(() => {
        if (currentEntity?.id) {
            loadGames();
        }
    }, [currentEntity?.id]);

    // Auto-hide backfill result after 10 seconds
    useEffect(() => {
        if (showBackfillResult) {
            const timer = setTimeout(() => setShowBackfillResult(false), 10000);
            return () => clearTimeout(timer);
        }
    }, [showBackfillResult]);

    const loadGames = async () => {
        if (!currentEntity?.id) return;
        setLoading(true);
        try {
            const data = await fetchRecurringGames(currentEntity.id);
            setGames(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Group Games by Venue
    const gamesByVenue = useMemo(() => {
        const groups: Record<string, any[]> = {};
        
        // Initialize groups for all venues (even empty ones)
        venues.forEach(v => { groups[v.name] = []; });
        
        // Sort games into groups
        games.forEach(game => {
            const venue = venues.find(v => v.id === game.venueId);
            const venueName = venue ? venue.name : 'Unassigned / Unknown';
            if (!groups[venueName]) groups[venueName] = [];
            groups[venueName].push(game);
        });

        return groups;
    }, [games, venues]);

    // Check how many games are missing the composite key
    const gamesNeedingFix = useMemo(() => {
        return games.filter(game => {
            const key = (game as any)['dayOfWeek#name'];
            return !key || key === '';
        }).length;
    }, [games]);

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
                // Update
                await updateExistingRecurringGame({
                    id: editingGame.id,
                    ...formData
                });
            } else {
                // Create - entityId comes from formData now
                await createNewRecurringGame({
                    ...formData,
                    wasManuallyCreated: true
                });
            }
            await loadGames();
            setIsModalOpen(false);
        } catch (err) {
            console.error(err);
            alert('Failed to save game');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Backfill handler
    const handleBackfill = async () => {
        if (!window.confirm(
            'This will fix recurring games that are missing the composite key (dayOfWeek#name) ' +
            'which is required for the game resolver to find them.\n\n' +
            'This is a one-time fix for records created before the bug was patched.\n\n' +
            'Continue?'
        )) {
            return;
        }

        setIsBackfilling(true);
        setBackfillResult(null);
        setShowBackfillResult(false);

        try {
            const result = await backfillMissingCompositeKeys(games);
            setBackfillResult(result);
            setShowBackfillResult(true);
            
            // Reload games to reflect changes
            if (result.fixed > 0) {
                await loadGames();
            }
        } catch (err) {
            console.error('Backfill error:', err);
            setBackfillResult({
                fixed: 0,
                skipped: 0,
                errors: [err instanceof Error ? err.message : 'Unknown error']
            });
            setShowBackfillResult(true);
        } finally {
            setIsBackfilling(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading recurring games...</div>;

    return (
        <div className="space-y-6">
            {/* Backfill Result Banner */}
            {showBackfillResult && backfillResult && (
                <div className={`rounded-lg p-4 ${
                    backfillResult.errors.length > 0 
                        ? 'bg-amber-50 border border-amber-200' 
                        : 'bg-green-50 border border-green-200'
                }`}>
                    <div className="flex items-start gap-3">
                        {backfillResult.errors.length > 0 ? (
                            <ExclamationCircleIcon className="h-5 w-5 text-amber-600 mt-0.5" />
                        ) : (
                            <CheckCircleIcon className="h-5 w-5 text-green-600 mt-0.5" />
                        )}
                        <div className="flex-1">
                            <h4 className={`font-medium ${
                                backfillResult.errors.length > 0 ? 'text-amber-800' : 'text-green-800'
                            }`}>
                                Backfill Complete
                            </h4>
                            <p className={`text-sm mt-1 ${
                                backfillResult.errors.length > 0 ? 'text-amber-700' : 'text-green-700'
                            }`}>
                                Fixed: <strong>{backfillResult.fixed}</strong> | 
                                Already OK: <strong>{backfillResult.skipped}</strong>
                                {backfillResult.errors.length > 0 && (
                                    <> | Errors: <strong>{backfillResult.errors.length}</strong></>
                                )}
                            </p>
                            {backfillResult.errors.length > 0 && (
                                <ul className="mt-2 text-xs text-amber-600 list-disc list-inside">
                                    {backfillResult.errors.slice(0, 3).map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                    {backfillResult.errors.length > 3 && (
                                        <li>...and {backfillResult.errors.length - 3} more</li>
                                    )}
                                </ul>
                            )}
                        </div>
                        <button 
                            onClick={() => setShowBackfillResult(false)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* Header Actions */}
            <div className="flex justify-between items-center">
                {/* Left side - Admin tools */}
                <div className="flex items-center gap-3">
                    {/* Show backfill button if there are games that need fixing, or always show for admin visibility */}
                    <button
                        onClick={handleBackfill}
                        disabled={isBackfilling || games.length === 0}
                        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                            gamesNeedingFix > 0
                                ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={gamesNeedingFix > 0 
                            ? `${gamesNeedingFix} game(s) need the composite key fix`
                            : 'All games have valid composite keys'
                        }
                    >
                        <WrenchScrewdriverIcon className={`h-4 w-4 ${isBackfilling ? 'animate-spin' : ''}`} />
                        {isBackfilling ? 'Fixing...' : (
                            gamesNeedingFix > 0 
                                ? `Fix ${gamesNeedingFix} Record${gamesNeedingFix !== 1 ? 's' : ''}`
                                : 'Run Backfill'
                        )}
                    </button>
                    
                    {gamesNeedingFix > 0 && (
                        <span className="text-xs text-amber-600">
                            ⚠️ {gamesNeedingFix} game{gamesNeedingFix !== 1 ? 's' : ''} won't appear in resolver queries
                        </span>
                    )}
                </div>

                {/* Right side - Create button */}
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
                    // Only show venues that have games OR are active venues
                    if (venueGames.length === 0) return null;

                    return (
                        <div key={venueName} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                                <h3 className="font-semibold text-gray-800">{venueName}</h3>
                                <span className="text-xs text-gray-500">{venueGames.length} games</span>
                            </div>
                            
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {venueGames.map((game) => {
                                        // Check if this game is missing the composite key
                                        const isMissingKey = !((game as any)['dayOfWeek#name']);
                                        
                                        return (
                                            <tr key={game.id} className={`hover:bg-gray-50 ${isMissingKey ? 'bg-amber-50/50' : ''}`}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    <div className="flex items-center gap-2">
                                                        {game.name}
                                                        {game.isSignature && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                Signature
                                                            </span>
                                                        )}
                                                        {isMissingKey && (
                                                            <span 
                                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                                                                title="Missing composite key - won't be found by resolver"
                                                            >
                                                                ⚠️ Needs Fix
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <div className="flex items-center gap-1">
                                                        <CalendarIcon className="h-4 w-4" />
                                                        {game.dayOfWeek} @ {game.startTime || '—'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {game.gameVariant} • {formatCurrency(game.typicalBuyIn)}
                                                    {game.typicalGuarantee > 0 && (
                                                        <span className="text-green-600 ml-1">
                                                            ({formatCurrency(game.typicalGuarantee)} GTD)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                        game.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {game.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button 
                                                        onClick={() => handleEdit(game)}
                                                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                                                    >
                                                        <PencilSquareIcon className="h-4 w-4" />
                                                    </button>
                                                    {game.isActive && (
                                                        <button 
                                                            onClick={() => handleDeactivate(game.id)}
                                                            className="text-red-600 hover:text-red-900"
                                                            title="Deactivate"
                                                        >
                                                            <NoSymbolIcon className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
                
                {/* Empty State */}
                {games.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <p className="text-gray-500">No recurring games found. Create one to get started.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            <RecurringGameForm
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                initialData={editingGame || undefined}
                venues={venues}
                entities={entities}
                currentEntityId={currentEntity?.id}
                isSubmitting={isSubmitting}
            />
        </div>
    );
};