import { useState } from 'react';
import { useBulkGameFetcher } from '../hooks/useBulkGameFetcher';
import { BulkGameListItem } from '../components/scraper/BulkGameListItem';

export const BulkScraperPage = () => {
    const [startId, setStartId] = useState('');
    const [endId, setEndId] = useState('');
    const { games, status, errorMessage, fetchRange } = useBulkGameFetcher();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const start = parseInt(startId, 10);
        const end = parseInt(endId, 10);
        if (!isNaN(start) && !isNaN(end)) {
            fetchRange(start, end);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center text-gray-800">Bulk Game Fetcher</h2>
            
            <div className="p-4 bg-white rounded-xl shadow-lg">
                <form className="flex items-end space-x-3" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="startId" className="block text-sm font-medium text-gray-700">Start ID</label>
                        <input
                            type="number"
                            id="startId"
                            value={startId}
                            onChange={(e) => setStartId(e.target.value)}
                            className="mt-1 block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., 1"
                        />
                    </div>
                    <div>
                        <label htmlFor="endId" className="block text-sm font-medium text-gray-700">End ID</label>
                        <input
                            type="number"
                            id="endId"
                            value={endId}
                            onChange={(e) => setEndId(e.target.value)}
                            className="mt-1 block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., 20"
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        disabled={status === 'FETCHING'}
                    >
                        {status === 'FETCHING' ? 'Fetching...' : 'Fetch Range'}
                    </button>
                </form>
                <p className="text-xs text-gray-500 mt-2">Note: Maximum range is 50 games at a time.</p>
            </div>

            {status === 'FETCHING' && <p className="text-center text-gray-500 py-10">Fetching game data...</p>}
            {status === 'ERROR' && <p className="text-center text-red-600 py-10">Error: {errorMessage}</p>}
            
            {status === 'DONE' && (
                <div className="space-y-2">
                    <p className="text-sm text-gray-600">Found {games.length} results. Click an item to track it on the main dashboard.</p>
                    {games.map(game => (
                        <BulkGameListItem key={game.id} game={game} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default BulkScraperPage;