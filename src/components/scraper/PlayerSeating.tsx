// components/scraper/PlayerSeating.tsx

import type { PlayerSeatingData } from '../../types/game';

interface PlayerSeatingProps {
    seating?: PlayerSeatingData[];
}

export const PlayerSeating: React.FC<PlayerSeatingProps> = ({ seating }) => {
    if (!seating || seating.length === 0) {
        return <p className="text-sm text-gray-500">No active player seating information found.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Player
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Table / Seat
                        </th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stack
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {seating.map((player, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                {player.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {`Table ${player.table} / Seat ${player.seat}`}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                                {/* Format number with commas */}
                                {player.playerStack ? player.playerStack.toLocaleString() : 'N/A'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};