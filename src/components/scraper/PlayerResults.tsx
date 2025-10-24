import type { PlayerResultData } from '../../../types/game';

/**
 * PlayerResults component
 */
export const PlayerResults: React.FC<{ results?: PlayerResultData[] | null }> = ({ results }) => {
    if (!results || results.length === 0) return null;
    return (
        <div className="mt-4">
            <h4 className="font-bold text-sm mb-2">Player Results</h4>
            <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                {results.map((result, idx) => (
                    <div key={idx} className="flex justify-between text-xs py-1 border-b last:border-0">
                        <span>#{result.rank} - {result.name}</span>
                        <span className="font-medium">${result.winnings}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

