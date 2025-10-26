import type { PlayerEntryData } from '../../types/game';

/**
 * PlayerEntries component
 * Displays a list of registered player names.
 */
export const PlayerEntries: React.FC<{ entries?: PlayerEntryData[] | null }> = ({ entries }) => {
    if (!entries || entries.length === 0) return null;
    return (
        <div className="mt-4">
            <h4 className="font-bold text-sm mb-2">Player Entries ({entries.length})</h4>
            <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                <ul className="list-disc pl-5">
                    {entries.map((entry, idx) => (
                        <li key={idx} className="text-xs py-1">
                            {entry.name}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};