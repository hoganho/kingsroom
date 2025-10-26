import type { PlayerResultData } from '../../types/game';

/**
 * PlayerResults component
 */
export const PlayerResults: React.FC<{ results?: PlayerResultData[] | null }> = ({ results }) => {
    const hasData = results && results.length > 0;

    return (
        <div className="border rounded-lg bg-white">
            <h4 className="font-bold text-sm text-gray-700 p-3 border-b">Player Results</h4>
            <div className="p-3">
                {hasData ? (
                    <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                        {results.map((result, idx) => (
                            <div key={idx} className="flex justify-between text-xs py-1 border-b last:border-b-0">
                                <span>#{result.rank} - {result.name}</span>
                                <span className="font-medium">${result.winnings.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No results data available.</p>
                )}
            </div>
        </div>
    );
};