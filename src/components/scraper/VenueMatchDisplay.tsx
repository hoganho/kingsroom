// src/components/scraper/VenueMatchDisplay.tsx

import type { ScrapedVenueMatch } from '../../types/game'; // Adjust the import path as needed
import { CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/solid';

interface VenueMatchDisplayProps {
  venueMatch?: ScrapedVenueMatch | null;
}

const SuggestionItem: React.FC<{ name: string; score: number; isTopSuggestion: boolean }> = ({ name, score, isTopSuggestion }) => {
  const scorePercent = (score * 100).toFixed(0);
  const color = isTopSuggestion ? 'blue' : 'gray';

  return (
    <div className="flex items-center justify-between text-xs py-1">
      <div className="flex items-center truncate">
        <InformationCircleIcon className={`h-4 w-4 mr-2 text-${color}-500 flex-shrink-0`} />
        <span className="font-mono text-gray-800 truncate" title={name}>{name}</span>
      </div>
      <span className={`text-xs text-${color}-600 bg-${color}-100 px-2 py-0.5 rounded-full ml-2`}>
        {scorePercent}% match
      </span>
    </div>
  );
};

export const VenueMatchDisplay: React.FC<VenueMatchDisplayProps> = ({ venueMatch }) => {
  if (!venueMatch || !venueMatch.suggestions || venueMatch.suggestions.length === 0) {
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center font-bold text-gray-400">•</span>
        <span className="text-gray-600 w-32 flex-shrink-0">Venue Name:</span>
        <span className="font-mono text-gray-500">N/A</span>
        <span className="ml-auto text-xs text-gray-400 italic">No match found</span>
      </div>
    );
  }

  const { autoAssignedVenue, suggestions } = venueMatch;

  if (autoAssignedVenue) {
    const scorePercent = (autoAssignedVenue.score * 100).toFixed(0);
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center text-green-600">
            <CheckCircleIcon className="h-4 w-4 mx-auto" />
        </span>
        <span className="text-gray-600 w-32 flex-shrink-0">Venue Name:</span>
        <span className="font-mono text-gray-800 truncate" title={autoAssignedVenue.name}>{autoAssignedVenue.name}</span>
        <span className="ml-auto text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
          Auto-assigned ({scorePercent}%)
        </span>
      </div>
    );
  }

  return (
    <div className="text-xs py-1.5 border-b border-gray-200 last:border-b-0">
      <div className="flex items-center mb-1">
        <span className="w-5 text-center font-bold text-gray-400">•</span>
        <span className="text-gray-600 w-32 flex-shrink-0">Venue Suggestions:</span>
      </div>
      <div className="pl-5 space-y-1">
        {suggestions.map((suggestion, index) => (
          <SuggestionItem
            key={suggestion.id}
            name={suggestion.name}
            score={suggestion.score}
            isTopSuggestion={index === 0}
          />
        ))}
      </div>
    </div>
  );
};