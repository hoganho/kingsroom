// src/pages/ScraperPage.tsx - UPDATED WITH RESPONSIVE LAYOUT
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGameTracker } from '../hooks/useGameTracker';
import { GameCard } from '../components/scraper/GameCard';
import { DataSource } from '../API';
import { PageWrapper, PageCard } from '../components/layout/PageWrapper';

export const ScraperDashboard = () => {
    const [inputId, setInputId] = useState('');
    const { games, trackGame, saveGame, removeGame } = useGameTracker();
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const urlToTrack = searchParams.get('trackUrl');
        if (urlToTrack) {
            if (!games[urlToTrack]) {
                trackGame(urlToTrack, DataSource.SCRAPE);
            }
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, trackGame, games, setSearchParams]);

    const handleTrackGame = (id: string) => {
        if (id) {
            let trackId = id;
            if (!id.startsWith('http')) {
                trackId = `https://kingsroom.com.au/tournament/?id=${id}`;
            }
            trackGame(trackId, DataSource.SCRAPE);
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        handleTrackGame(inputId);
    };

    return (
        <PageWrapper title="Game Tracker Dashboard" maxWidth="4xl">
            {/* ✅ FIX: No extra padding div needed. PageWrapper handles it. */}
            <PageCard className="mb-6">
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={inputId}
                            onChange={(e) => setInputId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter Tournament URL or ID..."
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Track
                        </button>
                    </div>
                </form>
            </PageCard>

            <div className="space-y-4">
                {Object.values(games).length > 0 ? (
                    Object.values(games).map(game => (
                        <GameCard key={game.id} game={game} onSave={saveGame} onRemove={removeGame} />
                    ))
                ) : (
                    <PageCard>
                        <p className="text-center text-gray-500 py-10">
                            No games are being tracked. Add a URL to begin.
                        </p>
                    </PageCard>
                )}
            </div>
        </PageWrapper>
    );
};

export default ScraperDashboard;

