import type { TournamentLevelData } from '../../types/game';

/**
 * BlindStructure component
 */
export const BlindStructure: React.FC<{ levels?: TournamentLevelData[] | null }> = ({ levels }) => {
    if (!levels || levels.length === 0) return null;
    return (
        <div className="mt-4">
            <h4 className="font-bold text-sm mb-2">Blind Structure</h4>
            <div className="max-h-60 overflow-y-auto border rounded bg-gray-50">
                <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-2 py-1 text-left">Level</th>
                            <th className="px-2 py-1 text-left">Duration</th>
                            <th className="px-2 py-1 text-left">Blinds</th>
                            <th className="px-2 py-1 text-left">Ante</th>
                        </tr>
                    </thead>
                    <tbody>
                        {levels.map((level, idx) => (
                            <tr key={idx} className="border-b">
                                <td className="px-2 py-1">{level.levelNumber}</td>
                                <td className="px-2 py-1">{level.durationMinutes}min</td>
                                <td className="px-2 py-1">{level.smallBlind}/{level.bigBlind}</td>
                                <td className="px-2 py-1">{level.ante || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

