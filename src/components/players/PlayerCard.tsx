import React from 'react';
import {
  ChevronRightIcon,
  CalendarIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns'; // For formatting the 'lastGameDate'

/**
 * Player type that matches the actual GraphQL query response
 * Not extending APITypes.Player to avoid type conflicts with __typename requirements
 */
interface PlayerWithDetails {
  // Core player fields (using common alternatives)
  id: string;
  playerName?: string | null;  // Often 'playerName' instead of 'name'
  name?: string | null;         // Keep both for compatibility
  email?: string | null;
  active?: boolean | null;      // Often 'active' instead of 'isActive'
  isActive?: boolean | null;    // Keep both for compatibility
  
  // Summary data (might be computed fields)
  summary?: {
    lastGameDate?: string | null;
    totalEarnings?: number | null;
    totalGamesPlayed?: number | null;
  } | null;
  
  // Venue relationship
  registrationVenue?: {
    entity?: {
      entityName?: string | null;
    } | null;
  } | null;
  
  // Player entries with nested game and entity data
  playerEntries?: {
    items?: Array<{
      game?: {
        entity?: {
          entityName?: string | null;
        } | null;
      } | null;
    } | null> | null;
  } | null;
  
  // Include any other fields from APITypes.Player if needed
  [key: string]: any; // Allow additional fields
}

/**
 * Props for the PlayerCard component.
 * Based on the GraphQL query in PlayersDashboard.tsx
 */
interface PlayerCardProps {
  player: PlayerWithDetails; // Use our custom type that matches the GraphQL query
  showEntityInfo?: boolean;
}

/**
 * Utility function to get initials from a player's name.
 */
const getInitials = (name: string | undefined | null): string => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  showEntityInfo = false,
}) => {
  // Type-safe property access with fallbacks for different field names
  const playerData = player as PlayerWithDetails;
  
  // Handle different possible field names for player name
  const playerName = playerData.name || playerData.playerName || 'Unknown Player';
  
  // Handle different possible field names for active status
  const isActive = playerData.isActive ?? playerData.active ?? true;
  
  // Safely access other properties
  const email = playerData.email;
  const summary = playerData.summary;
  const registrationVenue = playerData.registrationVenue;
  const playerEntries = playerData.playerEntries;

  // Calculate unique entities the player has played in
  // This uses the 'playerEntries' data queried in the dashboard
  const playedInEntities = new Set<string>();
  if (showEntityInfo && playerEntries?.items) {
    playerEntries.items.forEach((entry) => {
      if (entry?.game?.entity?.entityName) {
        playedInEntities.add(entry.game.entity.entityName);
      }
    });
  }

  // Get the entity they registered at
  const registrationEntity = registrationVenue?.entity?.entityName;

  // Format the 'lastGameDate' from the summary
  let lastPlayedFormatted = 'N/A';
  if (summary?.lastGameDate) {
    try {
      // Use parseISO for AWSDateTime strings, similar to old dashboard
      lastPlayedFormatted = format(parseISO(summary.lastGameDate), 'dd MMM yyyy');
    } catch (e) {
      console.warn('Error parsing lastGameDate:', summary.lastGameDate, e);
      // Fallback if parsing fails
      lastPlayedFormatted = summary.lastGameDate.split('T')[0];
    }
  }

  return (
    // We can make this an 'a' tag to link to a player detail page later
    <div className="block hover:bg-gray-50 transition-colors">
      <div className="flex items-center px-4 py-4 sm:px-6">
        {/* Left: Avatar/Icon */}
        <div className="flex-shrink-0 mr-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-500">
            <span className="font-medium leading-none text-white">
              {getInitials(playerName)}
            </span>
          </span>
        </div>

        {/* Center: Name, Email, Status, and Entity Tags */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-3">
            <p className="truncate text-sm font-medium text-indigo-600">
              {playerName}
            </p>
            {/* Status Badge */}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isActive
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="truncate text-sm text-gray-500">{email || 'No email'}</p>

          {/* Entity Info Section (uses showEntityInfo prop) */}
          {showEntityInfo && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {registrationEntity && (
                <span
                  title={`Registered at ${registrationEntity}`}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
                >
                  Registered: {registrationEntity}
                </span>
              )}
              {Array.from(playedInEntities).map((entityName) => (
                <span
                  key={entityName}
                  title={`Played at ${entityName}`}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                >
                  {entityName}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Stats (hidden on mobile) */}
        <div className="hidden md:flex flex-shrink-0 ml-6 space-x-6 items-center">
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Last Played</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              <CalendarIcon className="h-4 w-4 text-gray-400 mr-1" />
              {lastPlayedFormatted}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Total Earnings</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              <CurrencyDollarIcon className="h-4 w-4 text-gray-400 mr-1" />
              ${(summary?.totalEarnings || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Games</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              <ChartBarIcon className="h-4 w-4 text-gray-400 mr-1" />
              {summary?.totalGamesPlayed || 0}
            </span>
          </div>
        </div>

        {/* Far Right: Chevron */}
        <div className="ml-4 flex-shrink-0">
          <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
};