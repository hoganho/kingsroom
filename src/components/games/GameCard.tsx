import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as APITypes from '../../API'; // Import the auto-generated types
import { format, parseISO } from 'date-fns';
import {
  MapPinIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChevronRightIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';

/**
 * Props for the GameCard component.
 * Based on the GraphQL query in GamesDashboard.tsx
 */
interface GameCardProps {
  game: APITypes.Game;
  showEntityName?: boolean; // Optional prop to show entity name
}

/**
 * Gets the CSS class for a game status badge.
 * Based on the new GameStatus enum and
 * old dashboard's styling.
 */
const getStatusBadgeClass = (status: string | null | undefined) => {
  switch (status) {
    case 'RUNNING':
    case 'REGISTERING': // Matches 'Late Registration' / 'Registration Open' style
      return 'bg-green-100 text-green-800';
    case 'FINISHED': // Matches 'Complete' style
      return 'bg-gray-100 text-gray-800';
    case 'SCHEDULED':
      return 'bg-blue-100 text-blue-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    case 'INITIATING':
    case 'CLOCK_STOPPED':
    case 'UNKNOWN':
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
};

/**
 * Formats a number as currency.
 * Uses $ to match the new dashboard's stats section.
 */
const formatCurrency = (amount?: number | null) => {
  if (amount === null || amount === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const GameCard: React.FC<GameCardProps> = ({
  game,
  showEntityName = false,
}) => {
  const navigate = useNavigate();
  const {
    id,
    name,
    gameStartDateTime,
    gameStatus,
    buyIn,
    totalEntries,
    prizepool,
    venue,
    entity,
  } = game;

  // Navigate to game details page on click, like in the old dashboard
  const handleGameClick = () => {
    navigate(`/games/details/${id}`);
  };

  // Format date and time parts
  let startDate = '';
  let startTime = '';
  let startMonth = '';

  try {
    const parsedDate = parseISO(gameStartDateTime);
    startDate = format(parsedDate, 'dd');
    startTime = format(parsedDate, 'HH:mm');
    startMonth = format(parsedDate, 'MMM');
  } catch (e) {
    console.warn('Invalid gameStartDateTime:', gameStartDateTime);
  }

  return (
    <li
      onClick={handleGameClick}
      className="block hover:bg-gray-50 transition-colors cursor-pointer"
    >
      <div className="flex items-center px-4 py-4 sm:px-6">
        {/* Left: Date/Time Block */}
        <div className="flex-shrink-0 mr-4 text-center w-12">
          <p className="text-sm font-medium text-indigo-600 uppercase">
            {startMonth}
          </p>
          <p className="text-2xl font-bold text-gray-900">{startDate}</p>
          <p className="text-sm text-gray-500">{startTime}</p>
        </div>

        {/* Center: Name, Venue, Status, and Entity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-3">
            <p className="truncate text-sm font-medium text-indigo-600">
              {name}
            </p>
            <span
              className={`inline-flex px-2 text-xs font-semibold rounded-full ${getStatusBadgeClass(
                gameStatus,
              )}`}
            >
              {gameStatus}
            </span>
          </div>
          <div className="mt-1 flex items-center text-sm text-gray-500">
            <MapPinIcon className="flex-shrink-0 h-4 w-4 text-gray-400 mr-1.5" />
            <span>{venue?.name || 'No Venue'}</span>
          </div>

          {/* Optional Entity Name Display */}
          {showEntityName && entity?.entityName && (
            <div className="mt-1 flex items-center text-sm text-gray-500">
              <BuildingOffice2Icon className="flex-shrink-0 h-4 w-4 text-gray-400 mr-1.5" />
              <span>{entity.entityName}</span>
            </div>
          )}
        </div>

        {/* Right: Stats (hidden on mobile) */}
        <div className="hidden md:flex flex-shrink-0 ml-6 space-x-6 items-center">
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Buy-in</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              {formatCurrency(buyIn)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Entries</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              <UserGroupIcon className="h-4 w-4 text-gray-400 mr-1" />
              {totalEntries || 'N/A'}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">Prizepool</span>
            <span className="text-sm font-medium text-gray-900 flex items-center">
              <CurrencyDollarIcon className="h-4 w-4 text-gray-400 mr-1" />
              {formatCurrency(prizepool)}
            </span>
          </div>
        </div>

        {/* Far Right: Chevron */}
        <div className="ml-4 flex-shrink-0">
          <ChevronRightIcon className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    </li>
  );
};