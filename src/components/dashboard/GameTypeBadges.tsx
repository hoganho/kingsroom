// src/components/dashboard/GameTypeBadges.tsx
// Badges for game types: Series, Main Event, Satellite, Recurring

import React from 'react';
import {
  TrophyIcon,
  StarIcon,
  BoltIcon,
  ArrowPathRoundedSquareIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/Badge';
import type { DashboardGameData } from '@/types/dashboard';

interface GameTypeBadgesProps {
  game: DashboardGameData;
}

export const GameTypeBadges: React.FC<GameTypeBadgesProps> = ({ game }) => {
  const badges: React.ReactNode[] = [];
  
  if (game.isSeries) {
    badges.push(
      <Badge 
        key="series" 
        variant="default" 
        className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800"
      >
        <TrophyIcon className="w-3 h-3 mr-0.5" />
        Series
      </Badge>
    );
  }
  
  if (game.isMainEvent) {
    badges.push(
      <Badge 
        key="main" 
        variant="default" 
        className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
      >
        <StarIcon className="w-3 h-3 mr-0.5" />
        Main Event
      </Badge>
    );
  }
  
  if (game.isSatellite) {
    badges.push(
      <Badge 
        key="satellite" 
        variant="default" 
        className="text-[10px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"
      >
        <BoltIcon className="w-3 h-3 mr-0.5" />
        Satellite
      </Badge>
    );
  }
  
  if (game.isRecurring) {
    badges.push(
      <Badge 
        key="recurring" 
        variant="default" 
        className="text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800"
      >
        <ArrowPathRoundedSquareIcon className="w-3 h-3 mr-0.5" />
        Recurring
      </Badge>
    );
  }
  
  if (badges.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges}
    </div>
  );
};
