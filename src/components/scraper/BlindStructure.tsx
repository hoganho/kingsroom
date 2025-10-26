import type { TournamentLevelData } from '../../types/game';

/**
 * BlindStructure component
 */
export const BlindStructure: React.FC<{ levels?: TournamentLevelData[] | null }> = ({ levels }) => {
    const hasData = levels && levels.length > 0;

    return (
        <div className="border rounded-lg bg-white">
            <h4 className="font-bold text-sm text-gray-700 p-3 border-b">Blind Structure</h4>
            <div className="p-3">
                {hasData ? (
                    <div className="max-h-60 overflow-y-auto border rounded bg-gray-50">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="px-2 py-1 text-left">Level</th>
                                    <th className="px-2 py-1 text-left">Duration</th>
                                    <th className="px-2 py-1 text-left">Blinds</th>
                                    <th className="px-2 py-1 text-left">Ante</th>
                                    {levels.some(l => l.breakMinutes) && (
                                        <th className="px-2 py-1 text-left">Break</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {levels.map((level, idx) => (
                                    <tr key={idx} className={`border-b last:border-b-0 ${level.breakMinutes ? 'bg-blue-50' : ''}`}>
                                        <td className="px-2 py-1">{level.levelNumber}</td>
                                        <td className="px-2 py-1">{level.durationMinutes}min</td>
                                        <td className="px-2 py-1">{level.smallBlind}/{level.bigBlind}</td>
                                        <td className="px-2 py-1">{level.ante || '-'}</td>
                                        {levels.some(l => l.breakMinutes) && (
                                            <td className="px-2 py-1 font-medium text-blue-700">
                                                {level.breakMinutes ? `${level.breakMinutes}min` : '-'}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No blind structure data available.</p>
                )}
            </div>
        </div>
    );
};