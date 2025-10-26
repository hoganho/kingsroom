import type { TournamentLevelData, BreakData } from '../../types/game';

/**
 * Breaks component
 * Displays a table of scheduled tournament breaks.
 */
export const Breaks: React.FC<{ breaks?: BreakData[] | null, levels?: TournamentLevelData[] | null }> = ({ breaks, levels }) => {
    const hasData = breaks && breaks.length > 0;
    
    // Create a map for quick lookup of level durations
    const levelDurationMap = new Map(levels?.map(l => [l.levelNumber, l.durationMinutes]));

    return (
        <div className="border rounded-lg bg-white">
            <h4 className="font-bold text-sm text-gray-700 p-3 border-b">Break Schedule</h4>
            <div className="p-3">
                {hasData ? (
                    <div className="border rounded bg-gray-50">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="px-2 py-1 text-left">Occurs After Level</th>
                                    <th className="px-2 py-1 text-left">Break Duration</th>
                                    <th className="px-2 py-1 text-left">Level Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {breaks.map((breakInfo, idx) => (
                                    <tr key={idx} className="border-b last:border-b-0">
                                        <td className="px-2 py-1 font-medium">{breakInfo.levelNumberBeforeBreak}</td>
                                        <td className="px-2 py-1 font-medium text-blue-700">{breakInfo.durationMinutes} min</td>
                                        <td className="px-2 py-1 text-gray-600">
                                            {levelDurationMap.get(breakInfo.levelNumberBeforeBreak) ? 
                                                `${levelDurationMap.get(breakInfo.levelNumberBeforeBreak)} min` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">No break schedule data available.</p>
                )}
            </div>
        </div>
    );
};