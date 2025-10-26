import { useNavigate } from 'react-router-dom';
import type { BulkGameSummary } from '../../types/game';

export const BulkGameListItem: React.FC<{ game: BulkGameSummary }> = ({ game }) => {
    const navigate = useNavigate();

    const handleClick = () => {
        // Navigate to the dashboard and pass the full URL as a query param
        const trackUrl = `https://kingsroom.com.au/tournament/?id=${game.id}`;
        navigate(`/scraper-dashboard?trackUrl=${encodeURIComponent(trackUrl)}`);
    };

    const hasError = !!game.error;

    return (
        <div 
            onClick={!hasError ? handleClick : undefined}
            className={`flex items-center justify-between p-3 border rounded-lg transition-all ${
                hasError 
                ? 'bg-red-50 border-red-200' 
                : 'bg-white hover:bg-gray-50 hover:shadow-md cursor-pointer'
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
                {/* ✅ UPDATED: Added an else condition to explicitly show "Not in DB" */}
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