import { useState } from 'react';
import { useGameTracker } from '../hooks/useGameTracker';
import { GameCard } from '../components/scraper/GameCard';

/**
 * Main dashboard component.
 * This is now the top-level page component.
 */
export const ScraperDashboard = () => {
    const [inputId, setInputId] = useState('');
    const [inputMode, setInputMode] = useState<'AUTO' | 'API'>('AUTO');
    const { games, trackGame, saveGame, removeGame } = useGameTracker();

    const handleTrackGame = (id: string, source: 'SCRAPE' | 'API') => {
        if(id){
            let trackId = id;
            if (source === 'SCRAPE' && !id.startsWith('http')) {
                trackId = `https://kingsroom.com.au/tournament/?id=${id}`;
            }
            trackGame(trackId, source);
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        if (inputMode === 'API') handleTrackGame(inputId, 'API');
        else handleTrackGame(inputId, 'SCRAPE');
    };

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center text-gray-800">Game Tracker Dashboard</h2>
            <div className="p-4 bg-white rounded-xl shadow-lg">
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={inputId}
                            onChange={(e) => setInputId(e.target.value)}
                            className="flex-grow block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={inputMode === 'API' ? "Enter API ID..." : "Enter tournament ID or full URL..."}
                        />
                        <button type="submit" className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                            Track
                        </button>
                    </div>
                    <div className="flex space-x-4 text-sm">
                        <label className="flex items-center">
                            <input type="radio" value="AUTO" checked={inputMode === 'AUTO'} onChange={(e) => setInputMode(e.target.value as 'AUTO' | 'API')} className="mr-2"/>
                            <span className="text-gray-700">Tournament (Scrape)</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" value="API" checked={inputMode === 'API'} onChange={(e) => setInputMode(e.target.value as 'AUTO' | 'API')} className="mr-2"/>
                            <span className="text-gray-700">API Mode (Mocked)</span>
                        </label>
                    </div>
                    {inputMode === 'AUTO' && (
                        <div className="text-xs text-gray-500 space-y-1">
                            <p>Scraping from: kingsroom.com.au/tournament/?id=</p>
                            <p>Examples: Enter just "2" or paste full URL</p>
                        </div>
                    )}
                </form>
            </div>
            <div className="space-y-4">
                {Object.values(games).length > 0 ? (
                    Object.values(games).map(game => (
                        <GameCard key={game.id} game={game} onSave={saveGame} onRemove={removeGame} />
                    ))
                ) : (
                    <p className="text-center text-gray-500 py-10">No games are being tracked. Add a URL to begin.</p>
                )}
            </div>
        </div>
    );
};

// Export as default to be used as a page component
export default ScraperDashboard;