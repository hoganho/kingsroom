// PlayerEntries.tsx

import type { PlayerEntryData } from '../../types/game';

/**
 * PlayerEntries component
 * Displays a list of registered player names.
 */
export const PlayerEntries: React.FC<{ entries?: PlayerEntryData[] | null }> = ({ entries }) => {
    const hasData = entries && entries.length > 0;

    // ✅ REFACTORED: Removed outer div wrapper and title
    if (!hasData) {
        return <p className="text-xs text-gray-500 p-3">No player entry data available.</p>;
    }

    return (
        <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
            <ul className="list-disc pl-5">
                {entries.map((entry, idx) => (
                    <li key={idx} className="text-xs py-1">
                        {entry.name}
                    </li>
                ))}
            </ul>
        </div>
    );
};