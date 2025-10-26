import type { PlayerEntryData } from '../../types/game';

/**
 * PlayerEntries component
 * Displays a list of registered player names.
 */
export const PlayerEntries: React.FC<{ entries?: PlayerEntryData[] | null }> = ({ entries }) => {
    const hasData = entries && entries.length > 0;

    return (
        <div className="border rounded-lg bg-white">
            <h4 className="font-bold text-sm text-gray-700 p-3 border-b">Player Entries ({entries?.length || 0})</h4>
            <div className="p-3">
                {hasData ? (
                    <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                        <ul className="list-disc pl-5">
                            {entries.map((entry, idx) => (
                                <li key={idx} className="text-xs py-1">
                                    {entry.name}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No player entry data available.</p>
                )}
            </div>
        </div>
    );
};