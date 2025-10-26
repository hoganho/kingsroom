import type { PlayerSeatingData } from '../../types/game';

/**
 * PlayerSeating component
 * Displays a table of player seating assignments.
 */
export const PlayerSeating: React.FC<{ seating?: PlayerSeatingData[] | null }> = ({ seating }) => {
    if (!seating || seating.length === 0) return null;
    
    // Sort by table, then seat
    const sortedSeating = [...seating].sort((a, b) => {
        if (a.table !== b.table) return a.table - b.table;
        return a.seat - b.seat;
    });

    return (
        <div className="mt-4">
            <h4 className="font-bold text-sm mb-2">Player Seating ({seating.length})</h4>
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
                            <tr key={idx} className="border-b">
                                <td className="px-2 py-1">{seat.table}</td>
                                <td className="px-2 py-1">{seat.seat}</td>
                                <td className="px-2 py-1">{seat.name}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};