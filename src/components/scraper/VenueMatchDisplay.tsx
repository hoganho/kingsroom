// src/components/scraper/VenueMatchDisplay.tsx

import type { VenueMatch } from '../../types/game';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

interface VenueMatchDisplayProps {
  venueMatch?: VenueMatch | null;
}

export const VenueMatchDisplay: React.FC<VenueMatchDisplayProps> = ({ venueMatch }) => {
  const definition = { label: 'Venue Name' };
  
  if (!venueMatch || venueMatch.matchType === 'NO_MATCH') {
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center font-bold text-gray-400">•</span>
        <span className="text-gray-600 w-32 flex-shrink-0">{definition.label}:</span>
        <span className="font-mono text-gray-500">N/A</span>
        <span className="ml-auto text-xs text-gray-400 italic">No match found</span>
      </div>
    );
  }

  const { bestMatch, matchType } = venueMatch;
  
  // Check if bestMatch exists before trying to access its properties
  if (!bestMatch) {
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center font-bold text-gray-400">•</span>
        <span className="text-gray-600 w-32 flex-shrink-0">{definition.label}:</span>
        <span className="font-mono text-gray-500">N/A</span>
        <span className="ml-auto text-xs text-gray-400 italic">No venue match data</span>
      </div>
    );
  }
  
  const scorePercent = (bestMatch.score * 100).toFixed(0);

  if (matchType === 'AUTO_ASSIGN') {
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center font-bold text-green-600">✓</span>
        <span className="text-gray-600 w-32 flex-shrink-0">{definition.label}:</span>
        <span className="font-mono text-gray-800 truncate" title={bestMatch.name}>{bestMatch.name}</span>
        <span className="ml-auto text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
          Auto-assigned ({scorePercent}%)
        </span>
      </div>
    );
  }

  if (matchType === 'SUGGESTION') {
    return (
      <div className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0">
        <span className="w-5 text-center font-bold text-blue-600">
            <InformationCircleIcon className="h-4 w-4 mx-auto" />
        </span>
        <span className="text-gray-600 w-32 flex-shrink-0">{definition.label}:</span>
        <span className="font-mono text-gray-800 truncate" title={bestMatch.name}>{bestMatch.name}</span>
        <span className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
          Suggestion ({scorePercent}%)
        </span>
      </div>
    );
  }

  return null; // Fallback
};