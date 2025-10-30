// GameCard.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import type { GameState, GameData } from '../../types/game.ts';
import * as APITypes from '../../API';
import { getStatusColor } from './helpers.ts';
import { HtmlModal } from './HtmlModal.tsx';
import { SaveConfirmationModal } from './SaveConfirmationModal.tsx';
import { ScraperReport } from './ScraperReport.tsx';
import { StructureInfo } from './StructureInfo.tsx';
import { POLLING_INTERVAL } from '../../hooks/useGameTracker.ts';
import { useGameContext } from '../../contexts/GameContext.tsx';
import { type GraphQLResult } from '@aws-amplify/api-graphql';

type Venue = APITypes.Venue;

export const GameCard: React.FC<{ 
    game: GameState; 
    onSave: (id: string, venueId: string) => void; 
    onRemove: (id: string) => void;
}> = ({ game, onSave, onRemove }) => {
    const client = generateClient();
    const { dispatch } = useGameContext();
    const [venueId, setVenueId] = useState('');
    const [showHtmlModal, setShowHtmlModal] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [countdown, setCountdown] = useState('');
    const [doNotScrape, setDoNotScrape] = useState(game.data?.doNotScrape ?? false);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venuesLoading, setVenuesLoading] = useState(false);

    // Fetch venues from database
    useEffect(() => {
        const fetchVenues = async () => {
            setVenuesLoading(true);
            try {
                const response = (await client.graphql({ 
                    query: listVenuesForDropdown 
                })) as GraphQLResult<{ listVenues: { items: Venue[] } }>;

                const venueItems = (response.data?.listVenues.items as Venue[])
                    .filter(Boolean)
                    .sort((a, b) => {
                        if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
                            return a.venueNumber - b.venueNumber;
                        }
                        return a.name.localeCompare(b.name);
                    });
                setVenues(venueItems);
            } catch (err) {
                console.error('Error fetching venues:', err);
            } finally {
                setVenuesLoading(false);
            }
        };
        fetchVenues();
    }, []);

    // ✅ Auto-select venue if provided in game data and available in the list
    useEffect(() => {
        if (game.data?.venueId && venues.some(v => v.id === game.data.venueId)) {
            setVenueId(game.data.venueId);
        }
    }, [game.data, venues]);

    useEffect(() => {
        setDoNotScrape(game.data?.doNotScrape ?? false);
    }, [game.data?.doNotScrape]);

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
            calculateCountdown();
            interval = setInterval(calculateCountdown, 1000);
        } else {
            setCountdown('');
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [game.autoRefresh, game.lastFetched, game.data?.doNotScrape]);
    
    const rawHtml = game.data?.rawHtml || '';
    const lastFetched = game.lastFetched ? new Date(game.lastFetched) : null;
    const lastFetchedDate = lastFetched?.toLocaleDateString() || 'Never';
    const lastFetchedTime = lastFetched?.toLocaleTimeString() || '';
    const isSaveDisabled = !venueId || game.jobStatus === 'SAVING';

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

    const handleDoNotScrapeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setDoNotScrape(isChecked);
        dispatch({
            type: 'UPDATE_GAME_STATE',
            payload: {
                id: game.id,
                data: {
                    ...(game.data as GameData),
                    doNotScrape: isChecked,
                },
                ...(isChecked && { autoRefresh: false })
            }
        });
    };

    const formatVenueOption = (venue: Venue) => {
        return venue.venueNumber !== undefined 
            ? `${venue.venueNumber} - ${venue.name}`
            : venue.name;
    };

    return (
        <>
            <div className="border border-gray-200 rounded-lg p-4 space-y-2 shadow-md bg-white">
                {/* Card Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex-shrink-0">{game.source}</span>
                        <p className="text-sm font-mono truncate" title={game.id}>{getDisplayId(game.id)}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        {/* ✅ MOVED: View Raw HTML button is now smaller and in the header */}
                        {rawHtml && (
                            <button
                                onClick={() => setShowHtmlModal(true)}
                                className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                title={`View raw scraped HTML (${(rawHtml.length / 1024).toFixed(1)} KB)`}
                            >
                                🔍 HTML
                            </button>
                        )}
                        <a 
                            href={game.id} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                            title="Open tournament page in new tab"
                        >
                            Launch URL 🚀
                        </a>
                        <span className={`px-2 py-1 text-xs font-bold text-white rounded-full ${getStatusColor(game.jobStatus)}`}>{game.jobStatus}</span>
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

                {game.data?.doNotScrape && game.jobStatus !== 'ERROR' && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs font-medium text-yellow-800">
                            ⚠️ This game is flagged "Do Not Scrape". Auto-refresh is disabled.
                        </p>
                    </div>
                )}
                
                {(game.jobStatus !== 'FETCHING' && game.jobStatus !== 'SCRAPING' && game.jobStatus !== 'PARSING' && game.isNewStructure !== undefined) && (
                    <StructureInfo 
                        isNewStructure={game.isNewStructure} 
                        structureLabel={game.data?.structureLabel}
                        foundKeys={game.data?.foundKeys}
                    />
                )}
                
                {game.data?.name && (
                    <div className="bg-gray-50 p-2 rounded border">
                        {game.existingGameId && (
                            <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-2 inline-block">
                                ✓ Existing Game in DB
                            </span>
                        )}
                        <h4 className="font-bold text-lg">{game.data.name}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                            {game.data.gameStartDateTime ? (
                                <p className="text-xs text-gray-600">{game.data.gameStartDateTime}</p>
                            ) : (
                                <p className="text-xs text-red-500 italic">Start Time Missing</p>
                            )}

                            {game.data.gameStatus && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    game.data.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-800' :
                                    game.data.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-800' :
                                    game.data.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {game.data.gameStatus}
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
                            <span className="ml-2">(Fetches: {game.fetchCount})</span>
                        </div>
                    </div>
                )}
                
                {/* ✅ After save, show success message and hide the report/actions */}
                {game.saveResult ? (
                    <div className="p-4 my-2 text-center bg-green-50 border border-green-200 rounded-lg">
                        <p className="font-semibold text-green-800">Successfully saved!</p>
                        <p className="text-sm text-green-700 mt-1">Game ID: {game.saveResult.id}</p>
                    </div>
                ) : (
                    <>
                        {(game.jobStatus === 'READY_TO_SAVE' || game.jobStatus === 'DONE' || game.jobStatus === 'SAVING') && (
                            <ScraperReport data={game.data} />
                        )}
                        
                        <div className="flex space-x-2 pt-2 items-center">
                            {venuesLoading ? (
                                <div className="flex-grow text-center text-gray-500 text-sm">
                                    Loading venues...
                                </div>
                            ) : (
                                <select
                                    value={venueId}
                                    onChange={(e) => setVenueId(e.target.value)}
                                    className="flex-grow mt-1 block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                                    disabled={game.jobStatus === 'SAVING' || venues.length === 0}
                                >
                                    <option value="">
                                        {venues.length === 0 ? 'No venues available - Add venues first' : 'Select Venue...'}
                                    </option>
                                    {venues.map(venue => (
                                        <option key={venue.id} value={venue.id}>
                                            {formatVenueOption(venue)}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={() => setIsConfirmModalOpen(true)}
                                disabled={isSaveDisabled}
                                className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                            >
                                {game.jobStatus === 'SAVING' ? 'Saving...' : (game.existingGameId ? 'Update in DB' : 'Save to DB')}
                            </button>
                        </div>

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
                    </>
                )}
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