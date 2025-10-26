import { useNavigate } from 'react-router-dom';
import type { BulkGameSummary } from '../../types/game';

// Helper function to determine list item color based on game status
const getListItemColorClass = (status?: string, registrationStatus?: string): string => {
    switch (status) {
        case 'RUNNING':
            if (registrationStatus === 'OPEN') return 'bg-green-100 border-green-200 hover:bg-green-200'; // Light Green
            if (registrationStatus === 'CLOSED') return 'bg-green-200 border-green-300 hover:bg-green-300'; // Normal Green
            break;
        case 'SCHEDULED':
            if (registrationStatus === 'OPEN') return 'bg-blue-100 border-blue-200 hover:bg-blue-200'; // Light Blue
            break;
        case 'REGISTERING':
            if (registrationStatus === 'FINAL') return 'bg-orange-100 border-orange-200 hover:bg-orange-200'; // Light Orange
            break;
        case 'CLOCK STOPPED':
            return 'bg-yellow-100 border-yellow-200 hover:bg-yellow-200'; // Light Yellow
        case 'FINISHED':
            if (registrationStatus === 'CLOSED') return 'bg-gray-100 border-gray-200'; // Light Gray (no hover effect)
            break;
        default:
            // Any other unhandled status will be red to catch attention
            return 'bg-red-100 border-red-200';
    }
    // Fallback for cases where status matches but registrationStatus does not
    return 'bg-red-100 border-red-200';
};

export const BulkGameListItem: React.FC<{ game: BulkGameSummary }> = ({ game }) => {
    const navigate = useNavigate();

    const handleClick = () => {
        const trackUrl = `https://kingsroom.com.au/tournament/?id=${game.id}`;
        navigate(`/scraper-dashboard?trackUrl=${encodeURIComponent(trackUrl)}`);
    };

    const hasError = !!game.error;

    // ✅ FIXED: Convert potential `null` values to `undefined` to match the function signature.
    const colorClass = getListItemColorClass(game.status ?? undefined, game.registrationStatus ?? undefined);
    const isActionable = !hasError && game.status !== 'FINISHED' && !colorClass.includes('red');

    return (
        <div
            onClick={isActionable ? handleClick : undefined}
            className={`flex items-center justify-between p-3 border rounded-lg transition-all ${
                hasError
                    ? 'bg-red-50 border-red-200'
                    : `${colorClass} ${isActionable ? 'hover:shadow-md cursor-pointer' : ''}`
            }`}
        >
            <div className="flex items-center space-x-4">
                <span className="font-mono text-sm text-gray-700 w-8 text-center">{game.id}</span>
                <div className="flex-grow">
                    <p className={`font-medium ${hasError ? 'text-red-700' : 'text-gray-800'}`}>{game.name}</p>
                    <p className="text-xs text-gray-500">{game.gameStartDateTime || 'No date found'}</p>
                    {hasError && <p className="text-xs text-red-600 mt-1">Error: {game.error}</p>}
                </div>
            </div>
            <div className="flex items-center space-x-3 text-xs text-right">
                <div className="w-24">
                    <p>{game.status}</p>
                    <p className="italic text-gray-400">{game.registrationStatus}</p>
                </div>
                {game.inDatabase ? (
                    <div className="flex items-center space-x-1 p-1 bg-green-100 text-green-800 rounded">
                        <span>✓ In DB</span>
                        {game.doNotScrape && <span className="font-bold text-red-600">(No Scrape)</span>}
                    </div>
                ) : (
                    <div className="flex items-center p-1 bg-gray-100 text-gray-500 rounded">
                        <span>Not in DB</span>
                    </div>
                )}
            </div>
        </div>
    );
};