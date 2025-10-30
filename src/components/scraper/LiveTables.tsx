// LiveTables.tsx

import type { TableData } from '../../types/game';

/**
 * LiveTables component
 * Displays live table data, including player names and stacks.
 */
export const LiveTables: React.FC<{ tables?: TableData[] | null }> = ({ tables }) => {
    const hasData = tables && tables.length > 0;

    // ✅ REFACTORED: Removed outer div wrapper and title
    if (!hasData) {
        return <p className="text-xs text-gray-500 p-3">No live table data available.</p>;
    }

    return (
        <div className="space-y-3">
            {tables.map((table, idx) => (
                <div key={idx} className="border rounded bg-gray-50">
                    <h5 className="font-semibold text-xs bg-gray-100 px-2 py-1 border-b">
                        {table.tableName}
                    </h5>
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-2 py-1 text-left w-1/6">Seat</th>
                                <th className="px-2 py-1 text-left w-3/6">Player</th>
                                <th className="px-2 py-1 text-left w-2/6">Stack</th>
                            </tr>
                        </thead>
                        <tbody>
                            {table.seats.map((seat, sIdx) => (
                                <tr key={sIdx} className="border-t last:border-t-0">
                                    <td className="px-2 py-1 font-medium">{seat.seat}</td>
                                    <td className="px-2 py-1">
                                        {seat.isOccupied ? seat.playerName : <span className="italic text-gray-400">Empty</span>}
                                    </td>
                                    <td className="px-2 py-1 font-mono">
                                        {seat.isOccupied ? seat.playerStack?.toLocaleString() : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};