import { useState, useEffect } from 'react';
import type { GameState } from '../../types/game';
import { getStatusColor } from './helpers';
import { HtmlModal } from './HtmlModal';
import { SaveConfirmationModal } from './SaveConfirmationModal';
import { PlayerResults } from './PlayerResults';
import { ScraperReport } from './ScraperReport';
import { StructureInfo } from './StructureInfo';

// ✅ NEW: Define the polling interval (5 minutes) to calculate next fetch
const POLLING_INTERVAL = 5 * 60 * 1000;

/**
 * GameCard component (UPDATED for RUNNING status and new job statuses)
 */
export const GameCard: React.FC<{ 
    game: GameState; 
    onSave: (id: string, venueId: string) => void; 
    onRemove: (id: string) => void;
}> = ({ game, onSave, onRemove }) => {
    const [venueId, setVenueId] = useState('');
    const [showHtmlModal, setShowHtmlModal] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // ✅ NEW: Add local state for the countdown timer
    const [countdown, setCountdown] = useState<string | null>(null);

    const rawHtml = game.data?.rawHtml || '';
    const lastFetched = game.lastFetched ? new Date(game.lastFetched) : null;
    const lastFetchedDate = lastFetched?.toLocaleDateString() || 'Never';
    const lastFetchedTime = lastFetched?.toLocaleTimeString() || '';

    // ✅ NEW: Add a useEffect to manage the countdown timer
    useEffect(() => {
        // Ensure we should be counting down
        if (!game.autoRefresh || !game.lastFetched) {
            setCountdown(null);
            return;
        }

        const lastFetchedTime = new Date(game.lastFetched).getTime();
        const nextFetchTime = lastFetchedTime + POLLING_INTERVAL;

        // Set up an interval to update the countdown every second
        const intervalId = setInterval(() => {
            const now = new Date().getTime();
            const distance = nextFetchTime - now;

            if (distance < 0) {
                // Time's up. The poller in useGameTracker will take over.
                setCountdown("00:00");
                clearInterval(intervalId); // Stop this timer
            } else {
                // Format the time remaining
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                
                // Format to "MM:SS"
                const formattedCountdown = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                
                setCountdown(formattedCountdown);
            }
        }, 1000); // Update every second

        // Cleanup function to clear the interval
        return () => {
            clearInterval(intervalId);
        };

    }, [game.lastFetched, game.autoRefresh]); // Dependencies

    // Save button is now enabled for all statuses except ERROR
    const isSaveDisabled = !venueId || game.status === 'DONE' || game.status === 'SAVING' || game.status === 'ERROR';

    const getDisplayId = (id: string) => {
        if (id.startsWith('http')) {
            const url = new URL(id);
            return `${url.hostname}${url.pathname}${url.search}`.substring(0, 50);
        }
        return id.substring(0, 50);
    };

    const handleConfirmSave = () => {
        if (venueId) {
            onSave(game.id, venueId);
        }
        setIsConfirmModalOpen(false);
    };

    return (
        <>
            <div className="border border-gray-200 rounded-lg p-4 space-y-2 shadow-md bg-white">
                <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex-shrink-0">{game.source}</span>
                        <p className="text-sm font-mono truncate" title={game.id}>{getDisplayId(game.id)}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        <a 
                            href={game.id} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                            title="Open tournament page in new tab"
                        >
                            Launch URL 🚀
                        </a>
                        <span className={`px-2 py-1 text-xs font-bold text-white rounded-full ${getStatusColor(game.status)}`}>{game.status}</span>
                        <button onClick={() => onRemove(game.id)} className="text-gray-400 hover:text-red-600 font-bold text-xl">×</button>
                    </div>
                </div>
                
                {game.errorMessage && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">{game.errorMessage}</p>}
                
                {(game.status !== 'FETCHING' && game.status !== 'SCRAPING' && game.status !== 'PARSING' && game.isNewStructure !== undefined) && (
                    <StructureInfo 
                        isNewStructure={game.isNewStructure} 
                        structureLabel={game.data?.structureLabel}
                        foundKeys={game.data?.foundKeys}
                    />
                )}
                
                {game.data?.name && (
                    <div className="bg-gray-50 p-2 rounded border">
                        <h4 className="font-bold text-lg">{game.data.name}</h4>
                        <div className="flex items-center gap-2">
                            {/* Updated to check for value before displaying */}
                            {game.data.gameStartDateTime ? (
                                <p className="text-xs text-gray-600">{game.data.gameStartDateTime}</p>
                            ) : (
                                <p className="text-xs text-red-500 italic">Start Time Missing</p>
                            )}

                            {game.data.status && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    game.data.status === 'RUNNING' ? 'bg-green-100 text-green-800' :
                                    game.data.status === 'COMPLETED' ? 'bg-gray-100 text-gray-800' :
                                    game.data.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {game.data.status}
                                </span>
                            )}
                            {game.autoRefresh && (
                                <span className="text-xs text-green-600 font-medium">
                                    🔄 Auto-refresh enabled
                                </span>
                            )}
                        </div>
                        {/* ✅ UPDATED: Expanded fetch time details */}
                        <div className="text-xs text-gray-500 mt-1">
                            <p>
                                Last Fetched: {lastFetchedDate} at {lastFetchedTime}
                                {/* Show re-fetch count after the first re-fetch */}
                                {game.fetchCount && game.fetchCount > 1 && (
                                    <span className="ml-2 font-medium text-gray-600">
                                        (Re-fetched {game.fetchCount - 1} time{game.fetchCount - 1 > 1 ? 's' : ''})
                                    </span>
                                )}
                            </p>
                            {/* ✅ UPDATED: Show the live countdown */}
                            {game.autoRefresh && lastFetched && (
                                <p className="text-green-700 font-medium">
                                    {countdown ? (
                                        <span>Next fetch in: {countdown}</span>
                                    ) : (
                                        <span>Calculating next fetch...</span>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                )}
                
                {(game.status === 'READY_TO_SAVE' || game.status === 'DONE' || game.status === 'SAVING') && (
                    <>
                        <PlayerResults results={game.data?.results ?? undefined} />
                        <ScraperReport data={game.data} missingFields={game.missingFields} />
                    </>
                )}
                
                {game.saveResult && <p className="text-xs text-green-600">Successfully saved! Game ID: {game.saveResult.id}</p>}
                
                {rawHtml && (
                    <div className="pt-2">
                         <button onClick={() => setShowHtmlModal(true)} className="w-full px-3 py-1 text-xs border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                            🔍 View Raw HTML {rawHtml ? `(${(rawHtml.length / 1024).toFixed(1)} KB)` : ''}
                        </button>
                    </div>
                )}

                <div className="flex space-x-2 pt-2">
                    <input
                        type="text"
                        value={venueId}
                        onChange={(e) => setVenueId(e.target.value)}
                        className="flex-grow mt-1 block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                        placeholder="Venue ID to Save"
                        disabled={game.status === 'DONE' || game.status === 'SAVING'}
                    />
                    <button
                        onClick={() => setIsConfirmModalOpen(true)}
                        disabled={isSaveDisabled}
                        className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                    >
                        {game.status === 'SAVING' ? 'Saving...' : 'Save to DB'}
                    </button>
                </div>
            </div>

            <HtmlModal isOpen={showHtmlModal} onClose={() => setShowHtmlModal(false)} html={rawHtml} gameId={game.id}/>
            <SaveConfirmationModal 
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleConfirmSave}
                gameData={game.data}
                venueId={venueId}
                sourceUrl={game.id}
            />
        </>
    );
};