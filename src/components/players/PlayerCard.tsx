// src/components/players/PlayerCard.tsx
// Player Card Component - Displays player information in list views

import React from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRightIcon,
  CalendarIcon,
  CurrencyPoundIcon,
  TrophyIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

import type { PlayerListItem, PlayerCardProps } from '../../types/player';
import {
  formatPlayerName,
  formatPlayerInitials,
  formatStatus,
  formatCategory,
  formatDate,
  formatCurrency,
  formatNumber,
  getPrimaryVenue,
  getNetBalanceColor,
} from '../../utils/playerHelpers';

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  showEntityInfo = false,
  onClick,
}) => {
  const status = formatStatus(player.status);
  const category = formatCategory(player.category);
  const summary = player.playerSummary;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick(player);
    }
  };

  return (
    <div className="bg-white px-4 py-5 sm:px-6 hover:bg-gray-50 transition-colors border-b border-gray-200 last:border-b-0">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick?.(player)}
      >
        <div className="flex items-center min-w-0 flex-1">
          {/* Player Avatar */}
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {formatPlayerInitials(player)}
              </span>
            </div>
          </div>

          {/* Player Info */}
          <div className="ml-4 flex-1 min-w-0">
            {/* Name and Status Badges */}
            <div className="flex items-center flex-wrap gap-2">
              <h4 className="text-lg font-medium text-gray-900 truncate">
                {formatPlayerName(player)}
              </h4>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.textColor}`}
              >
                {status.label}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${category.bgColor} ${category.textColor}`}
              >
                {category.label}
              </span>
            </div>

            {/* Contact Info */}
            <div className="mt-1 flex items-center text-sm text-gray-500">
              {player.email && <span className="truncate">{player.email}</span>}
              {player.email && player.phone && <span className="mx-2">•</span>}
              {player.phone && <span>{player.phone}</span>}
            </div>

            {/* Stats Row */}
            <div className="mt-2 flex items-center flex-wrap gap-4 text-sm">
              {/* Games Played */}
              <div className="flex items-center text-gray-500">
                <TrophyIcon className="h-4 w-4 mr-1" />
                <span>{formatNumber(summary?.gamesPlayedAllTime)} games</span>
              </div>

              {/* Net Balance */}
              <div className={`flex items-center ${getNetBalanceColor(summary?.netBalance)}`}>
                <CurrencyPoundIcon className="h-4 w-4 mr-1" />
                <span className="font-medium">
                  {formatCurrency(summary?.netBalance, { showSign: true })}
                </span>
              </div>

              {/* Primary Venue */}
              {showEntityInfo && (
                <div className="flex items-center text-gray-500">
                  <MapPinIcon className="h-4 w-4 mr-1" />
                  <span>{getPrimaryVenue(player)}</span>
                </div>
              )}

              {/* Last Played */}
              {summary?.lastPlayed && (
                <div className="flex items-center text-gray-500">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  <span>Last: {formatDate(summary.lastPlayed)}</span>
                </div>
              )}
            </div>

            {/* Additional Details - Only show if summary exists */}
            {summary && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">30d Games:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {formatNumber(summary.gamesPlayedLast30Days)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Avg Finish:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {summary.averageFinishPosition?.toFixed(1) || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Tournaments:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {formatNumber(summary.tournamentsPlayed)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Cash Games:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {formatNumber(summary.cashGamesPlayed)}
                  </span>
                </div>
              </div>
            )}

            {/* Balance Details */}
            <div className="mt-2 flex items-center flex-wrap gap-4 text-xs">
              {player.creditBalance !== undefined && player.creditBalance !== null && (
                <div>
                  <span className="text-gray-500">Credits:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {formatCurrency(player.creditBalance)}
                  </span>
                </div>
              )}
              {player.pointsBalance !== undefined && player.pointsBalance !== null && (
                <div>
                  <span className="text-gray-500">Points:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {formatNumber(player.pointsBalance)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Member Since:</span>
                <span className="ml-1 font-medium text-gray-900">
                  {formatDate(player.registrationDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex-shrink-0 ml-4">
          <Link
            to={`/players/profile/${player.id}`}
            className="inline-flex items-center p-2 border border-transparent rounded-full text-indigo-600 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={(e) => e.stopPropagation()}
            aria-label={`View ${formatPlayerName(player)}'s profile`}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PlayerCardCompact - Smaller version for sidebars/lists
// ============================================================================

interface PlayerCardCompactProps {
  player: PlayerListItem;
  rank?: number;
  onClick?: (player: PlayerListItem) => void;
}

export const PlayerCardCompact: React.FC<PlayerCardCompactProps> = ({
  player,
  rank,
  onClick,
}) => {
  const category = formatCategory(player.category);

  const getRankBadgeColor = (r: number): string => {
    switch (r) {
      case 1:
        return 'bg-yellow-400 text-white';
      case 2:
        return 'bg-gray-300 text-gray-800';
      case 3:
        return 'bg-orange-400 text-white';
      default:
        return 'bg-gray-200 text-gray-600';
    }
  };

  return (
    <div
      className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
      onClick={() => onClick?.(player)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(player)}
    >
      <div className="flex items-center space-x-3">
        {/* Rank Badge (optional) */}
        {rank !== undefined && (
          <div className="flex-shrink-0">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center ${getRankBadgeColor(rank)}`}
            >
              <span className="text-sm font-bold">{rank}</span>
            </div>
          </div>
        )}

        {/* Avatar (if no rank) */}
        {rank === undefined && (
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-xs font-medium text-gray-600">
                {formatPlayerInitials(player)}
              </span>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {formatPlayerName(player)}
          </p>
          <div className="mt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${category.bgColor} ${category.textColor}`}
            >
              {category.label}
            </span>
          </div>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-gray-500">
              {formatNumber(player.playerSummary?.gamesPlayedAllTime)} games
            </p>
            <p
              className={`text-xs font-semibold ${getNetBalanceColor(player.playerSummary?.netBalance)}`}
            >
              Net: {formatCurrency(player.playerSummary?.netBalance, { showSign: true })}
            </p>
          </div>
          {/* Venues played at */}
          {player.playerVenues?.items && player.playerVenues.items.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500">Venues:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {player.playerVenues.items.slice(0, 3).map(
                  (pv) =>
                    pv?.venue && (
                      <span
                        key={pv.venue.id}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {pv.venue.name}
                      </span>
                    )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PlayerCardSkeleton - Loading state
// ============================================================================

export const PlayerCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white px-4 py-5 sm:px-6 border-b border-gray-200">
      <div className="animate-pulse flex items-center">
        <div className="flex-shrink-0">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
        </div>
        <div className="ml-4 flex-1">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
};

export default PlayerCard;
