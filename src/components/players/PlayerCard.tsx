// src/components/players/PlayerCard.tsx
// Player Card Component - Displays player information with correct schema fields
// FIXED VERSION - Corrected imports and enum values

import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronRightIcon, 
  CalendarIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';

// Import enums as VALUES (not types)
import { 
  PlayerAccountStatus,
  PlayerAccountCategory 
} from '../../API';

// Import types separately
import type { 
  PlayerSummary, 
  ModelPlayerVenueConnection,
  ModelPlayerEntryConnection
} from '../../API';

// Define a type-safe interface that matches API structure
interface PlayerWithRelationships {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status: PlayerAccountStatus;
  category: PlayerAccountCategory;
  targetingClassification?: string | null;
  registrationDate: string;
  firstGamePlayed?: string | null;
  lastPlayedDate?: string | null;
  creditBalance?: number | null;
  pointsBalance?: number | null;
  primaryEntityId?: string | null;
  playerSummary?: PlayerSummary | null;
  playerVenues?: ModelPlayerVenueConnection | null;
  playerEntries?: ModelPlayerEntryConnection | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface PlayerCardProps {
  player: PlayerWithRelationships;
  showEntityInfo?: boolean;
  onClick?: (player: PlayerWithRelationships) => void;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ 
  player, 
  showEntityInfo = false,
  onClick 
}) => {
  // Helper functions
  const formatPlayerName = (): string => {
    return `${player.firstName} ${player.lastName}`;
  };

  // Format status using actual enum values from schema
  const formatStatus = (status: PlayerAccountStatus): { label: string; color: string } => {
    switch (status) {
      case PlayerAccountStatus.ACTIVE:
        return { label: 'Active', color: 'green' };
      case PlayerAccountStatus.SUSPENDED:
        return { label: 'Suspended', color: 'yellow' };
      case PlayerAccountStatus.PENDING_VERIFICATION:
        return { label: 'Pending', color: 'gray' };
      default:
        return { label: status, color: 'gray' };
    }
  };

  // Format category using actual enum values from schema
  const formatCategory = (category: PlayerAccountCategory): { label: string; color: string } => {
    switch (category) {
      case PlayerAccountCategory.NEW:
        return { label: 'New', color: 'green' };
      case PlayerAccountCategory.RECREATIONAL:
        return { label: 'Recreational', color: 'blue' };
      case PlayerAccountCategory.REGULAR:
        return { label: 'Regular', color: 'indigo' };
      case PlayerAccountCategory.VIP:
        return { label: 'VIP', color: 'purple' };
      case PlayerAccountCategory.LAPSED:
        return { label: 'Lapsed', color: 'gray' };
      default:
        return { label: category, color: 'gray' };
    }
  };

  const getPrimaryVenue = (): string => {
    const venues = player.playerVenues?.items || [];
    if (venues.length === 0) return 'No venue';
    
    // Find the venue with most games played
    const primaryVenue = venues.reduce((prev, current) => {
      if (!current || !prev) return prev || current;
      return (current.totalGamesPlayed || 0) > (prev.totalGamesPlayed || 0) ? current : prev;
    }, null);
    
    return primaryVenue?.venue?.name || 'Unknown venue';
  };

  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount?: number | null): string => {
    if (amount === undefined || amount === null) return '$0';
    const isNegative = amount < 0;
    const formatted = Math.abs(amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return isNegative ? `-${formatted}` : formatted;
  };

  const status = formatStatus(player.status);
  const category = formatCategory(player.category);
  const summary = player.playerSummary;

  return (
    <div className="bg-white px-4 py-5 sm:px-6 hover:bg-gray-50 transition-colors">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => onClick?.(player)}
      >
        <div className="flex items-center min-w-0">
          {/* Player Avatar */}
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">
                {player.firstName[0]}{player.lastName[0]}
              </span>
            </div>
          </div>

          {/* Player Info */}
          <div className="ml-4 flex-1">
            <div className="flex items-center">
              <h4 className="text-lg font-medium text-gray-900 truncate">
                {formatPlayerName()}
              </h4>
              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-800`}>
                {status.label}
              </span>
              <span className={`ml-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${category.color}-100 text-${category.color}-800`}>
                {category.label}
              </span>
            </div>

            {/* Contact Info */}
            <div className="mt-1 flex items-center text-sm text-gray-500">
              {player.email && (
                <span className="truncate">{player.email}</span>
              )}
              {player.email && player.phone && (
                <span className="mx-2">•</span>
              )}
              {player.phone && (
                <span>{player.phone}</span>
              )}
            </div>

            {/* Stats Row */}
            <div className="mt-2 flex items-center space-x-4 text-sm">
              {/* Games Played */}
              <div className="flex items-center text-gray-500">
                <TrophyIcon className="h-4 w-4 mr-1" />
                <span>{summary?.gamesPlayedAllTime || 0} games</span>
              </div>

              {/* Net Balance */}
              <div className={`flex items-center ${(summary?.netBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                <span className="font-medium">
                  {formatCurrency(summary?.netBalance)}
                </span>
              </div>

              {/* Primary Venue */}
              {showEntityInfo && (
                <div className="flex items-center text-gray-500">
                  <MapPinIcon className="h-4 w-4 mr-1" />
                  <span>{getPrimaryVenue()}</span>
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

            {/* Additional Details */}
            {summary && (
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">30d Games:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {summary.gamesPlayedLast30Days || 0}
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
                    {summary.tournamentsPlayed || 0}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Cash Games:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    {summary.cashGamesPlayed || 0}
                  </span>
                </div>
              </div>
            )}

            {/* Balance Details */}
            <div className="mt-2 flex items-center space-x-4 text-xs">
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
                    {player.pointsBalance.toLocaleString()}
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
            to={`/players/${player.id}`}
            className="inline-flex items-center p-2 border border-transparent rounded-full text-indigo-600 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
};