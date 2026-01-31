// src/components/dashboard/GameSection.tsx
// Section wrapper for game lists - only renders if there are games

import React from 'react';
import { PauseCircleIcon } from '@heroicons/react/24/outline';
import { SectionHeader } from './SectionHeader';
import { HorizontalScrollRow } from './HorizontalScrollRow';
import { GameCard } from './GameCard';
import type { 
  ActiveGameData, 
  FinishedGameData, 
  UpcomingGameData, 
  GameVariant 
} from '@/types/dashboard';

interface GameSectionProps {
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  games: (ActiveGameData | FinishedGameData | UpcomingGameData)[];
  variant: GameVariant;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  // For running games section, also show clock stopped games
  clockStoppedGames?: ActiveGameData[];
}

export const GameSection: React.FC<GameSectionProps> = ({
  title,
  icon,
  colorClass,
  games,
  variant,
  onRefresh,
  isRefreshing,
  clockStoppedGames = [],
}) => {
  // Calculate total count including clock stopped games for running section
  const totalCount = variant === 'running' || variant === 'clockStopped' 
    ? games.length + clockStoppedGames.length 
    : games.length;

  // Don't render section if there are no games
  if (totalCount === 0) {
    return null;
  }

  return (
    <section className="mb-10">
      <SectionHeader
        title={title}
        count={totalCount}
        icon={icon}
        colorClass={colorClass}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
      
      {/* Main games */}
      {games.length > 0 && (
        <HorizontalScrollRow>
          {games.map((game) => (
            <GameCard key={game.id} game={game} variant={variant} />
          ))}
        </HorizontalScrollRow>
      )}
      
      {/* Clock stopped games (only for running section) */}
      {clockStoppedGames.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
            <PauseCircleIcon className="w-4 h-4" />
            Clock Stopped ({clockStoppedGames.length})
          </p>
          <HorizontalScrollRow>
            {clockStoppedGames.map((game) => (
              <GameCard key={game.id} game={game} variant="clockStopped" />
            ))}
          </HorizontalScrollRow>
        </div>
      )}
    </section>
  );
};
