import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom'; // ✅ Import useSearchParams
import { useGameTracker } from '../hooks/useGameTracker';
import { GameCard } from '../components/scraper/GameCard';

export const ScraperDashboard = () => {
    const [inputId, setInputId] = useState('');
    const { games, trackGame, saveGame, removeGame } = useGameTracker();
    const [searchParams, setSearchParams] = useSearchParams(); // ✅ Get URL search params

    // ✅ NEW: Effect to auto-track a game from a URL parameter
    useEffect(() => {
        const urlToTrack = searchParams.get('trackUrl');
        if (urlToTrack) {
            // Check if the game is already being tracked to avoid duplicates
            if (!games[urlToTrack]) {
                trackGame(urlToTrack, 'SCRAPE');
            }
            // Clear the URL parameter so it doesn't re-track on refresh
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, trackGame, games, setSearchParams]);

    const handleTrackGame = (id: string) => {
        if (id) {
            let trackId = id;
            if (!id.startsWith('http')) {
                trackId = `https://kingsroom.com.au/tournament/?id=${id}`;
            }
            trackGame(trackId, 'SCRAPE');
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        handleTrackGame(inputId);
    };

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center text-gray-800">Game Tracker Dashboard</h2>
            <div className="p-4 bg-white rounded-xl shadow-lg">
                <form className="space-y-3" onSubmit={handleSubmit}>
                    {/* ... form inputs remain the same, but remove API mode if not needed ... */}
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

export default ScraperDashboard;