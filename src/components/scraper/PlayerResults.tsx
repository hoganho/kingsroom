// components/scraper/PlayerResults.tsx

import type { PlayerResultData } from '../../types/game';

/**
 * PlayerResults component
 */
export const PlayerResults: React.FC<{ results?: PlayerResultData[] | null }> = ({ results }) => {
    const hasData = results && results.length > 0;

    // ✅ REFACTORED: Removed outer div wrapper and title
    if (!hasData) {
        return <p className="text-xs text-gray-500 p-3">No results data available.</p>;
    }

    return (
        <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
            {results.map((result, idx) => (
                <div key={idx} className="flex justify-between text-xs py-1 border-b last:border-b-0">
                    <span>#{result.rank} - {result.name}</span>
                    <span className="font-medium">${result.winnings.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};