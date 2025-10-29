// src/pages/BulkScraperPage.tsx

import { useState } from 'react';
import { useBulkGameFetcher } from '../hooks/useBulkGameFetcher';
import { BulkGameListItem } from '../components/scraper/BulkGameListItem';
import type { BulkGameSummary } from '../types/game'; // Import the type from your file
import { PageWrapper, PageCard } from '../components/layout/PageWrapper';

/**
 * Renders the page for fetching and displaying a range of tournament summaries.
 */
export const BulkScraperPage = () => {
    // 1. Deconstruct the correct state and functions from the updated hook
    const { summaries, loading, error, fetchGames } = useBulkGameFetcher();
    
    // State for the form input fields
    const [startId, setStartId] = useState('');
    const [endId, setEndId] = useState('');

    /**
     * Handles the form submission to initiate the bulk fetch.
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const start = parseInt(startId, 10);
        const end = parseInt(endId, 10);

        // Basic validation before fetching
        if (!isNaN(start) && !isNaN(end) && start <= end) {
            fetchGames(start, end);
        } else {
            alert('Please enter a valid start and end ID, where start is less than or equal to end.');
        }
    };

    return (
        <PageWrapper title="Bulk Scraper" maxWidth="4xl">
            {/* ✅ FIX: No extra padding div needed. PageWrapper handles it. */}
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
                Bulk Scraper
            </h2>
            
            <PageCard className="mb-6">
                {/* Input Form */}
                <div className="p-4">
                    <form className="space-y-3" onSubmit={handleSubmit}>
                        <div className="flex items-center space-x-2">
                            <input
                                type="number"
                                value={startId}
                                onChange={(e) => setStartId(e.target.value)}
                                className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Start ID (e.g., 1)"
                                disabled={loading}
                            />
                            <input
                                type="number"
                                value={endId}
                                onChange={(e) => setEndId(e.target.value)}
                                className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="End ID (e.g., 10)"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                                disabled={loading}
                            >
                                {loading ? 'Fetching...' : 'Fetch Games'}
                            </button>
                        </div>
                    </form>
                </div>
            </PageCard>

            {/* Results Section */}
            <div className="space-y-4">
                {/* 2. Use the 'loading' and 'error' states for feedback */}
                {loading && <p className="text-center text-gray-600">Loading summaries...</p>}
                {error && <p className="text-center text-red-600 p-4 bg-red-50 rounded-md">Error: {error}</p>}

                {/* 3. Use the 'summaries' array to render the list */}
                {summaries.length > 0 && (
                    <div className="space-y-2">
                        {/* 4. Explicitly type the 'summary' parameter in the map function to fix build error */}
                        {summaries.map((summary: BulkGameSummary) => (
                            <BulkGameListItem key={summary.id} game={summary} />
                        ))}
                    </div>
                )}

                {!loading && summaries.length === 0 && !error && (
                    <p className="text-center text-gray-500 py-10">
                        Enter a range of tournament IDs and click "Fetch Games" to see the results.
                    </p>
                )}
            </div>
        </PageWrapper>
    );
};

export default BulkScraperPage;

