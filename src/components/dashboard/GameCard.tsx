// src/components/dashboard/GameCard.tsx
// Card displaying game information with variant-specific styling

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  PauseCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/Badge';
import { cx, formatCurrency } from '@/lib/utils';
import { formatRelativeAEST, formatAEST } from '@/utils/dateUtils';
import { GameTypeBadges } from './GameTypeBadges';
import { RegistrationBadge } from './RegistrationBadge';
import { VenueLogo } from './VenueLogo';
import { CountdownTimer } from './CountdownTimer';
import type { 
  ActiveGameData, 
  FinishedGameData, 
  UpcomingGameData, 
  GameVariant 
} from '@/types/dashboard';

interface GameCardProps {
  game: ActiveGameData | FinishedGameData | UpcomingGameData;
  variant: GameVariant;
}

// Helper to format dual date display
const formatDualDateTime = (dateString: string | null | undefined): { relative: string; absolute: string } => {
  if (!dateString) return { relative: '-', absolute: '-' };
  
  try {
    const relative = formatRelativeAEST(dateString);
    const absolute = formatAEST(dateString, { includeTime: true, includeDay: true, shortDay: true });
    return { relative, absolute };
  } catch {
    return { relative: 'Invalid Date', absolute: 'Invalid Date' };
  }
};

// Helper for value display
const valOrDash = (value: number | null | undefined, formatter?: (v: number) => string): string => {
  if (value === null || value === undefined || value === 0) return '-';
  return formatter ? formatter(value) : value.toLocaleString();
};

export const GameCard: React.FC<GameCardProps> = ({ game, variant }) => {
  const navigate = useNavigate();
  const { relative: relativeDate, absolute: absoluteDate } = formatDualDateTime(game.gameStartDateTime);
  
  // For finished games, also show finish date
  const finishDate = ('finishedAt' in game && game.finishedAt) 
    ? formatDualDateTime(game.finishedAt) 
    : ('gameEndDateTime' in game && game.gameEndDateTime) 
      ? formatDualDateTime(game.gameEndDateTime)
      : null;

  const getStatusBadge = (): React.ReactNode => {
    switch (variant) {
      case 'running':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <PlayIcon className="w-3 h-3" />
            Live
          </Badge>
        );
      case 'clockStopped':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <PauseCircleIcon className="w-3 h-3" />
            Paused
          </Badge>
        );
      case 'startingSoon':
        return (
          <Badge variant="neutral" className="flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            <ClockIcon className="w-3 h-3" />
            Soon
          </Badge>
        );
      case 'finished':
        const gameStatus = ('gameStatus' in game && game.gameStatus) || 'FINISHED';
        if (gameStatus === 'CANCELLED') {
          return (
            <Badge variant="error" className="flex items-center gap-1">
              <XCircleIcon className="w-3 h-3" />
              Cancelled
            </Badge>
          );
        }
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" />
            Complete
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge variant="neutral" className="flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            Upcoming
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get venue name and logo from either flat field or nested object
  const venueName = 'venueName' in game && game.venueName 
    ? game.venueName 
    : ('venue' in game && game.venue?.name) || null;
  
  const venueLogo = 'venueLogoCached' in game && game.venueLogoCached
    ? game.venueLogoCached
    : ('venue' in game && game.venue?.logo) || null;

  // Check for overlay indicator (running games only)
  const hasOverlay = 'hasOverlay' in game ? game.hasOverlay : false;
  
  // Registration status (running games)
  const registrationStatus = 'registrationStatus' in game ? game.registrationStatus : null;

  // Get the actual Game table ID (gameId) for navigation, fall back to id for direct Game queries
  const navigateToGameId = ('gameId' in game && game.gameId) ? game.gameId : game.id;

  return (
    <div 
      onClick={() => navigate(`/games/details/${navigateToGameId}`)}
      className={cx(
      "flex-shrink-0 w-[320px] sm:w-[340px] bg-white dark:bg-gray-950 rounded-xl shadow-sm border overflow-hidden transition-all self-start cursor-pointer group",
      variant === 'running' && "border-green-200 dark:border-green-800 hover:border-green-300",
      variant === 'clockStopped' && "border-yellow-200 dark:border-yellow-800 hover:border-yellow-300",
      variant === 'startingSoon' && "border-orange-200 dark:border-orange-800 hover:border-orange-300",
      variant === 'finished' && "border-gray-200 dark:border-gray-800 hover:border-gray-300",
      variant === 'upcoming' && "border-blue-200 dark:border-blue-800 hover:border-blue-300",
      "hover:shadow-md"
    )}>
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-3 mb-2">
          {/* Venue Logo */}
          <VenueLogo logo={venueLogo} name={venueName} />
          
          <div className="min-w-0 flex-1">
            {venueName && (
              <p className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
                {venueName}
              </p>
            )}
            <h4 className="font-semibold text-gray-900 dark:text-gray-50 text-sm sm:text-base leading-tight line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {game.name}
            </h4>
            
            {/* Game Type Badges */}
            <GameTypeBadges game={game} />
          </div>
          
          {/* Status Badges */}
          <div className="flex flex-col items-end gap-1">
            {hasOverlay && (
              <Badge variant="error" className="text-[10px]">
                <ExclamationTriangleIcon className="w-3 h-3 mr-0.5" />
                Overlay
              </Badge>
            )}
            {getStatusBadge()}
            {(variant === 'running' || variant === 'clockStopped') && (
              <RegistrationBadge status={registrationStatus} />
            )}
          </div>
        </div>
        
        {/* Date Display - Use countdown for startingSoon variant */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
            {variant === 'startingSoon' ? (
              <CountdownTimer targetDate={game.gameStartDateTime} />
            ) : (
              <span className="text-gray-900 dark:text-gray-100 font-medium">{relativeDate}</span>
            )}
          </div>
          <div className="pl-5.5 text-[10px] text-gray-500 dark:text-gray-400">
            {absoluteDate}
          </div>
        </div>
        
        {/* Finish date for completed games */}
        {variant === 'finished' && finishDate && (
          <div className="flex flex-col gap-0.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircleIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">Finished: {finishDate.relative}</span>
            </div>
            <div className="pl-5.5 text-[10px] text-gray-500 dark:text-gray-400">
              {finishDate.absolute}
            </div>
          </div>
        )}
      </div>

      {/* Card Body - Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        {(variant === 'running' || variant === 'clockStopped') && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Players Remaining</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash((game as ActiveGameData).playersRemaining)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total Entries</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash((game as ActiveGameData).totalEntries)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Unique Players</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash((game as ActiveGameData).totalUniquePlayers)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prizepool</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {valOrDash((game as ActiveGameData).prizepoolPaid || (game as ActiveGameData).prizepoolCalculated, formatCurrency)}
              </span>
            </div>
          </>
        )}

        {variant === 'startingSoon' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(game.buyIn, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Guarantee</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {('hasGuarantee' in game && game.hasGuarantee)
                  ? valOrDash(('guaranteeAmount' in game ? game.guaranteeAmount : null), formatCurrency)
                  : '-'
                }
              </span>
            </div>
            {'totalEntries' in game && (game as ActiveGameData).totalEntries && (
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400">Entries</span>
                <span className="font-semibold text-gray-900 dark:text-gray-50">
                  {valOrDash((game as ActiveGameData).totalEntries)}
                </span>
              </div>
            )}
          </>
        )}

        {variant === 'finished' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prizepool Paid</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {valOrDash((game as FinishedGameData).prizepoolPaid, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prizepool Calc</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash((game as FinishedGameData).prizepoolCalculated, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total Entries</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash((game as FinishedGameData).totalEntries)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(game.buyIn, formatCurrency)}
              </span>
            </div>
          </>
        )}

        {variant === 'upcoming' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(game.buyIn, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Guarantee</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {(game as UpcomingGameData).hasGuarantee 
                  ? valOrDash((game as UpcomingGameData).guaranteeAmount, formatCurrency)
                  : '-'
                }
              </span>
            </div>
          </>
        )}
      </div>

      {/* Card Footer - Source link and metadata */}
      <div className="px-4 pb-3 flex items-center justify-between">
        {game.sourceUrl && (
          <a
            href={game.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline"
          >
            View source →
          </a>
        )}
        {'lastRefreshedAt' in game && game.lastRefreshedAt && (() => {
          const { relative } = formatDualDateTime(game.lastRefreshedAt);
          return (
            <span className="text-[10px] text-gray-400">
              Updated {relative}
            </span>
          );
        })()}
      </div>
    </div>
  );
};
