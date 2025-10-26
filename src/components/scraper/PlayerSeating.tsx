import type { PlayerSeatingData } from '../../types/game';

/**
 * PlayerSeating component
 * Displays a table of player seating assignments.
 */
export const PlayerSeating: React.FC<{ seating?: PlayerSeatingData[] | null }> = ({ seating }) => {
    const hasData = seating && seating.length > 0;

    // Sort by table, then seat
    const sortedSeating = hasData ? [...seating].sort((a, b) => {
        if (a.table !== b.table) return a.table - b.table;
        return a.seat - b.seat;
    }) : [];

    return (
        <div className="border rounded-lg bg-white">
            <h4 className="font-bold text-sm text-gray-700 p-3 border-b">Player Seating ({seating?.length || 0})</h4>
            <div className="p-3">
                {hasData ? (
                     <div className="max-h-60 overflow-y-auto border rounded bg-gray-50">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="px-2 py-1 text-left">Table</th>
                                    <th className="px-2 py-1 text-left">Seat</th>
                                    <th className="px-2 py-1 text-left">Player</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSeating.map((seat, idx) => (
                                    <tr key={idx} className="border-b last:border-b-0">
                                        <td className="px-2 py-1">{seat.table}</td>
                                        <td className="px-2 py-1">{seat.seat}</td>
                                        <td className="px-2 py-1">{seat.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No player seating data available.</p>
                )}
            </div>
        </div>
    );
};