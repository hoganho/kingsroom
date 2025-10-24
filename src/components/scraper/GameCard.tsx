import { useState, useEffect } from 'react';
import type { GameState, GameData } from '../../types/game.ts';
import { getStatusColor } from './helpers.ts';
import { HtmlModal } from './HtmlModal.tsx';
import { SaveConfirmationModal } from './SaveConfirmationModal.tsx';
import { PlayerResults } from './PlayerResults.tsx';
import { ScraperReport } from './ScraperReport.tsx';
import { StructureInfo } from './StructureInfo.tsx';
import { POLLING_INTERVAL } from '../../hooks/useGameTracker.ts'; // Import polling interval
import { useGameContext } from '../../contexts/GameContext.tsx'; // Import context to update state

/**
 * GameCard component
 */
export const GameCard: React.FC<{ 
    game: GameState; 
    onSave: (id: string, venueId: string) => void; 
    onRemove: (id: string) => void;
}> = ({ game, onSave, onRemove }) => {
    const { dispatch } = useGameContext(); // Get dispatch to update game state
    const [venueId, setVenueId] = useState('');
    const [showHtmlModal, setShowHtmlModal] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [countdown, setCountdown] = useState('');

    // ✅ NEW: Local state for the doNotScrape checkbox
    // We initialize it from the game data and keep it in sync
    const [doNotScrape, setDoNotScrape] = useState(game.data?.doNotScrape ?? false);

    // Update local state if game data changes from a fetch
    useEffect(() => {
        setDoNotScrape(game.data?.doNotScrape ?? false);
    }, [game.data?.doNotScrape]);

    // ✅ NEW: Countdown timer effect
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
                    setCountdown(`Next fetch in ${minutes}m ${seconds.toString().padStart(2, '0')}s`);
                }
            };
            
            calculateCountdown(); // Run once immediately
            interval = setInterval(calculateCountdown, 1000); // Update every second
        } else {
            setCountdown(''); // Clear countdown if not auto-refreshing
        }

        return () => {
            if (interval) clearInterval(interval); // Cleanup interval
        };
    }, [game.autoRefresh, game.lastFetched, game.data?.doNotScrape]);
    
    const rawHtml = game.data?.rawHtml || '';
    const lastFetched = game.lastFetched ? new Date(game.lastFetched) : null;
    const lastFetchedDate = lastFetched?.toLocaleDateString() || 'Never';
    const lastFetchedTime = lastFetched?.toLocaleTimeString() || '';

    // ✅ UPDATED: Save button is enabled as long as venueId is present,
    // to allow updating the doNotScrape flag even on DONE games.
    const isSaveDisabled = !venueId || game.status === 'SAVING';

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

    // ✅ NEW: Handler to update the doNotScrape flag in the global state
    const handleDoNotScrapeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setDoNotScrape(isChecked); // Update local state

        // Dispatch update to global state so it's included when we save
        dispatch({
            type: 'UPDATE_GAME_STATE',
            payload: {
                id: game.id,
                data: {
                    ...(game.data as GameData),
                    doNotScrape: isChecked,
                },
                // If we check "Do Not Scrape", immediately turn off auto-refresh
                ...(isChecked && { autoRefresh: false })
            }
        });
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
                
                {game.errorMessage && (
                     <p className={`text-xs p-2 rounded border ${
                        game.errorMessage.includes('Scraping is disabled') 
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
                        : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                        {game.errorMessage}
                    </p>
                )}

                {/* ✅ NEW: "Do Not Scrape" warning */}
                {game.data?.doNotScrape && game.status !== 'ERROR' && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs font-medium text-yellow-800">
                            ⚠️ This game is flagged "Do Not Scrape". Auto-refresh is disabled.
                        </p>
                    </div>
                )}
                
                {(game.status !== 'FETCHING' && game.status !== 'SCRAPING' && game.status !== 'PARSING' && game.isNewStructure !== undefined) && (
                    <StructureInfo 
                        isNewStructure={game.isNewStructure} 
                        structureLabel={game.data?.structureLabel}
                        foundKeys={game.data?.foundKeys}
                    />
                )}
                
                {game.data?.name && (
                    <div className="bg-gray-50 p-2 rounded border">
                        {/* ✅ NEW: Existing Game ID indicator */}
                        {game.existingGameId && (
                            <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-2 inline-block">
                                ✓ Existing Game in DB
                            </span>
                        )}
                        <h4 className="font-bold text-lg">{game.data.name}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
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
                            {game.autoRefresh && !game.data?.doNotScrape && (
                                <span className="text-xs text-green-600 font-medium">
                                    🔄 {countdown || 'Auto-refresh enabled'}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            <span>Last Fetched: {lastFetchedDate} at {lastFetchedTime}</span>
                            {/* ✅ NEW: Fetch count display */}
                            <span className="ml-2">(Fetches: {game.fetchCount})</span>
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

                <div className="flex space-x-2 pt-2 items-center">
                    <input
                        type="text"
                        value={venueId}
                        onChange={(e) => setVenueId(e.target.value)}
                        className="flex-grow mt-1 block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                        placeholder="Venue ID to Save"
                        disabled={game.status === 'SAVING'}
                    />
                    <button
                        onClick={() => setIsConfirmModalOpen(true)}
                        disabled={isSaveDisabled}
                        className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                    >
                        {game.status === 'SAVING' ? 'Saving...' : (game.existingGameId ? 'Update in DB' : 'Save to DB')}
                    </button>
                </div>

                {/* ✅ NEW: "Do Not Scrape" Checkbox */}
                <div className="pt-2 border-t border-gray-100 mt-3">
                    <label className="flex items-center text-xs text-gray-700">
                        <input
                            type="checkbox"
                            className="mr-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={doNotScrape}
                            onChange={handleDoNotScrapeChange}
                        />
                        Do Not Scrape This URL Again (Flag will be saved when you click Save/Update)
                    </label>
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


