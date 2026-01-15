// src/pages/HomePage.tsx
// VERSION: 3.1.0 - Fixed: Manual refresh triggers Lambda, dual status indicators, proper state management
//
// ARCHITECTURE:
// - ActiveGame table: Fast queries for RUNNING, REGISTERING, CLOCK_STOPPED, INITIATING, SCHEDULED games
// - RecentlyFinishedGame table: Games finished in last 7 days (auto-cleaned via TTL)
// - UpcomingGame table: Games scheduled to start soon
// - Subscriptions: Real-time updates via onActiveGameChange
//
// SECTIONS:
// 1. Running Games (RUNNING + CLOCK_STOPPED) - Auto-refresh every 30 min, grouped by registration status
// 2. Starting Soon (<24h, INITIATING/SCHEDULED/REGISTERING) - Auto-refresh every 1 hour
// 3. Upcoming Games (>24h, INITIATING/SCHEDULED/REGISTERING) - Auto-refresh every 12 hours
// 4. Recently Finished (CANCELLED/FINISHED) - Sorted by finish date
//
// FEATURES:
// - Dual date display (relative + absolute AEST)
// - Game type badges (Series, Satellite, Recurring, Main Event)
// - Registration status badges (OPEN, FINAL)
// - Venue logos with fallback initials
// - Manual refresh per section (triggers Lambda scraper)
// - Clock-aligned auto-refresh (on the hour and half hour)
// - Dual status indicators (Auto-refresh + Live subscription)

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowPathIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  TrophyIcon,
  PauseCircleIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  StarIcon,
  ArrowPathRoundedSquareIcon,
  BoltIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import { formatCurrency, cx } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { useEntity } from '@/contexts/EntityContext';
import { toAEST, formatRelativeAEST, formatAEST } from '@/utils/dateUtils';
import { useScraperSettings } from '@/hooks/scraper/useScraperSettings';

// ============================================
// GRAPHQL QUERIES
// ============================================

// Query ActiveGame table for games in active states
const listActiveGamesByEntity = /* GraphQL */ `
  query ListActiveGamesByEntity($entityId: ID!, $statusFilter: ModelStringKeyConditionInput, $limit: Int) {
    activeGamesByEntity(
      entityId: $entityId
      gameStatus: $statusFilter
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStatus
        registrationStatus
        gameStartDateTime
        gameEndDateTime
        totalEntries
        totalUniquePlayers
        playersRemaining
        buyIn
        prizepoolPaid
        prizepoolCalculated
        guaranteeAmount
        hasGuarantee
        hasOverlay
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
        lastRefreshedAt
        refreshCount
      }
      nextToken
    }
  }
`;

// Query RecentlyFinishedGame table for fast finished game access
const listRecentlyFinishedByEntity = /* GraphQL */ `
  query ListRecentlyFinishedByEntity($entityId: ID!, $limit: Int) {
    recentlyFinishedByEntity(
      entityId: $entityId
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStartDateTime
        finishedAt
        totalDuration
        totalEntries
        totalUniquePlayers
        prizepoolPaid
        prizepoolCalculated
        buyIn
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
      }
      nextToken
    }
  }
`;

// Fallback: Query Game table using GSI for finished games (if RecentlyFinishedGame not populated)
const gamesByStatusFinished = /* GraphQL */ `
  query GamesByStatusFinished($gameStatus: GameStatus!, $since: String!, $limit: Int) {
    gamesByStatus(
      gameStatus: $gameStatus
      gameStartDateTime: { ge: $since }
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        entityId
        tournamentId
        name
        gameStartDateTime
        gameEndDateTime
        gameStatus
        prizepoolPaid
        prizepoolCalculated
        totalUniquePlayers
        totalInitialEntries
        totalEntries
        buyIn
        sourceUrl
        isSeries
        seriesName
        isMainEvent
        isSatellite
        venue {
          name
          logo
        }
      }
      nextToken
    }
  }
`;

// Query UpcomingGame table
const listUpcomingByEntity = /* GraphQL */ `
  query ListUpcomingByEntity($entityId: ID!, $limit: Int) {
    upcomingGamesByEntity(
      entityId: $entityId
      limit: $limit
      sortDirection: ASC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStartDateTime
        buyIn
        guaranteeAmount
        hasGuarantee
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
      }
      nextToken
    }
  }
`;

// Subscription for real-time active game updates
const onActiveGameChangeSubscription = /* GraphQL */ `
  subscription OnActiveGameChange($entityId: ID) {
    onActiveGameChange(entityId: $entityId) {
      id
      gameId
      entityId
      name
      venueName
      venueLogoCached
      gameStatus
      registrationStatus
      gameStartDateTime
      gameEndDateTime
      totalEntries
      totalUniquePlayers
      playersRemaining
      buyIn
      prizepoolPaid
      prizepoolCalculated
      sourceUrl
      lastRefreshedAt
      isSeries
      seriesName
      isMainEvent
      isSatellite
      isRecurring
      recurringGameName
    }
  }
`;

// Mutation to trigger Lambda scraper for manual refresh
const refreshRunningGamesMutation = /* GraphQL */ `
  mutation RefreshRunningGames($input: RefreshRunningGamesInput) {
    refreshRunningGames(input: $input) {
      success
      gamesRefreshed
      gamesUpdated
      gamesFailed
      errors
      executionTimeMs
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface ActiveGameData {
  id: string;
  gameId: string;
  entityId: string;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  entityName?: string | null;
  gameStatus: string;
  registrationStatus?: string | null;
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  playersRemaining?: number | null;
  buyIn?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  hasOverlay?: boolean | null;
  gameType?: string | null;
  gameVariant?: string | null;
  tournamentType?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
  lastRefreshedAt?: string | null;
  refreshCount?: number | null;
}

interface FinishedGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  entityName?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  finishedAt?: string | null;
  totalDuration?: number | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  buyIn?: number | null;
  gameType?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
}

interface UpcomingGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  buyIn?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  gameType?: string | null;
  gameVariant?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
}

type GameVariant = 'running' | 'clockStopped' | 'startingSoon' | 'upcoming' | 'finished';

// GraphQL response types
interface ActiveGamesByEntityData {
  activeGamesByEntity: {
    items: ActiveGameData[];
    nextToken?: string | null;
  };
}

interface RecentlyFinishedByEntityData {
  recentlyFinishedByEntity: {
    items: FinishedGameData[];
    nextToken?: string | null;
  };
}

interface UpcomingGamesByEntityData {
  upcomingGamesByEntity: {
    items: UpcomingGameData[];
    nextToken?: string | null;
  };
}

interface GamesByStatusData {
  gamesByStatus: {
    items: Array<FinishedGameData & { entityId?: string }>;
    nextToken?: string | null;
  };
}

interface OnActiveGameChangeData {
  onActiveGameChange: ActiveGameData;
}

interface RefreshRunningGamesData {
  refreshRunningGames: {
    success: boolean;
    gamesRefreshed: number;
    gamesUpdated: number;
    gamesFailed: number;
    errors?: string[];
    executionTimeMs?: number;
  };
}

interface AmplifySubscription {
  unsubscribe: () => void;
}

// ============================================
// CONSTANTS
// ============================================

// Auto-refresh intervals in milliseconds
const UPCOMING_REFRESH_INTERVAL = 12 * 60 * 60 * 1000;  // 12 hours (fallback)

// 24 hours in milliseconds for "starting soon" threshold
const STARTING_SOON_THRESHOLD = 24 * 60 * 60 * 1000;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate milliseconds until the next half-hour mark
 * Used for clock-aligned refresh (on the hour and half hour)
 */
const getMillisecondsUntilNextHalfHour = (): number => {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  
  // Calculate minutes until next half hour (0 or 30)
  const minutesUntilNext = minutes < 30 ? (30 - minutes) : (60 - minutes);
  
  // Convert to milliseconds and subtract current seconds/ms
  return (minutesUntilNext * 60 * 1000) - (seconds * 1000) - milliseconds;
};

/**
 * Calculate milliseconds until the next hour
 */
const getMillisecondsUntilNextHour = (): number => {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  
  const minutesUntilNext = 60 - minutes;
  return (minutesUntilNext * 60 * 1000) - (seconds * 1000) - milliseconds;
};

/**
 * Format a date showing both relative and absolute time in AEST
 */
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

/**
 * Check if a date is within the next 24 hours
 */
const isWithin24Hours = (dateString: string): boolean => {
  const gameDate = new Date(dateString);
  const now = new Date();
  const diff = gameDate.getTime() - now.getTime();
  return diff > 0 && diff <= STARTING_SOON_THRESHOLD;
};

/**
 * Check if a date is more than 24 hours from now
 */
const isMoreThan24Hours = (dateString: string): boolean => {
  const gameDate = new Date(dateString);
  const now = new Date();
  const diff = gameDate.getTime() - now.getTime();
  return diff > STARTING_SOON_THRESHOLD;
};

// ============================================
// HORIZONTAL SCROLL ROW COMPONENT
// ============================================

interface HorizontalScrollRowProps {
  children: React.ReactNode;
}

const HorizontalScrollRow: React.FC<HorizontalScrollRowProps> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScrollability();
    window.addEventListener('resize', checkScrollability);
    return () => window.removeEventListener('resize', checkScrollability);
  }, [children, checkScrollability]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 340;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScrollability, 300);
    }
  };

  return (
    <div className="relative group">
      {canScrollLeft && (
        <div className="absolute top-1/2 -translate-y-1/2 left-0 z-10 -ml-3">
          <button
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {canScrollRight && (
        <div className="absolute top-1/2 -translate-y-1/2 right-0 z-10 -mr-3">
          <button
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-4 px-1 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  );
};

// ============================================
// GAME TYPE BADGES COMPONENT
// ============================================

interface GameTypeBadgesProps {
  game: ActiveGameData | FinishedGameData | UpcomingGameData;
}

const GameTypeBadges: React.FC<GameTypeBadgesProps> = ({ game }) => {
  const badges: React.ReactNode[] = [];
  
  // Series badge
  if (game.isSeries) {
    badges.push(
      <Badge key="series" variant="default" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800">
        <TrophyIcon className="w-3 h-3 mr-0.5" />
        Series
      </Badge>
    );
  }
  
  // Main Event badge
  if (game.isMainEvent) {
    badges.push(
      <Badge key="main" variant="default" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
        <StarIcon className="w-3 h-3 mr-0.5" />
        Main Event
      </Badge>
    );
  }
  
  // Satellite badge
  if (game.isSatellite) {
    badges.push(
      <Badge key="satellite" variant="default" className="text-[10px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800">
        <BoltIcon className="w-3 h-3 mr-0.5" />
        Satellite
      </Badge>
    );
  }
  
  // Recurring badge
  if (game.isRecurring) {
    badges.push(
      <Badge key="recurring" variant="default" className="text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border-teal-200 dark:border-teal-800">
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

// ============================================
// REGISTRATION STATUS BADGE COMPONENT
// ============================================

interface RegistrationBadgeProps {
  status: string | null | undefined;
}

const RegistrationBadge: React.FC<RegistrationBadgeProps> = ({ status }) => {
  if (!status || !['OPEN', 'FINAL'].includes(status)) return null;
  
  if (status === 'OPEN') {
    return (
      <Badge variant="success" className="text-[10px]">
        <SignalIcon className="w-3 h-3 mr-0.5" />
        Reg Open
      </Badge>
    );
  }
  
  if (status === 'FINAL') {
    return (
      <Badge variant="warning" className="text-[10px]">
        <XCircleIcon className="w-3 h-3 mr-0.5" />
        Final
      </Badge>
    );
  }
  
  return null;
};

// ============================================
// VENUE LOGO COMPONENT
// ============================================

interface VenueLogoProps {
  logo: string | null | undefined;
  name: string | null | undefined;
  size?: 'sm' | 'md';
}

const VenueLogo: React.FC<VenueLogoProps> = ({ logo, name, size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  
  if (logo) {
    return (
      <img 
        src={logo} 
        alt={name || 'Venue'} 
        className={cx(sizeClasses, "rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm")}
      />
    );
  }
  
  // Fallback to initials
  const initials = name 
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  
  return (
    <div className={cx(
      sizeClasses,
      "rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-semibold border border-gray-200 dark:border-gray-700 shadow-sm"
    )}>
      {initials}
    </div>
  );
};

// ============================================
// GAME CARD COMPONENT
// ============================================

interface GameCardProps {
  game: ActiveGameData | FinishedGameData | UpcomingGameData;
  variant: GameVariant;
}

const GameCard: React.FC<GameCardProps> = ({ game, variant }) => {
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

  const valOrDash = (value: number | null | undefined, formatter?: (v: number) => string): string => {
    if (value === null || value === undefined || value === 0) return '-';
    return formatter ? formatter(value) : value.toLocaleString();
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

  return (
    <div className={cx(
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
        
        {/* Date Display - Dual format */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-900 dark:text-gray-100 font-medium">{relativeDate}</span>
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
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {variant === 'running' ? 'Players Remaining' : 'Players Remaining'}
              </span>
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
              <>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Entries</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-50">
                    {valOrDash((game as ActiveGameData).totalEntries)}
                  </span>
                </div>
              </>
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

// ============================================
// SECTION HEADER COMPONENT
// ============================================

interface SectionHeaderProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  colorClass?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastRefreshed?: Date | null;
  nextRefresh?: Date | null;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  count, 
  icon, 
  colorClass = 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  onRefresh,
  isRefreshing,
  lastRefreshed,
  nextRefresh
}) => {
  const formatTime = (date: Date | null): string => {
    if (!date) return '-';
    const aest = toAEST(date);
    const hours = aest.hours % 12 || 12;
    const ampm = aest.hours >= 12 ? 'PM' : 'AM';
    const mins = String(aest.minutes).padStart(2, '0');
    return `${hours}:${mins} ${ampm}`;
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={cx("flex items-center justify-center w-10 h-10 rounded-lg", colorClass)}>
          {icon}
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {count} game{count !== 1 ? 's' : ''}
            {lastRefreshed && (
              <span className="ml-2">• Last: {formatTime(lastRefreshed)}</span>
            )}
            {nextRefresh && (
              <span className="ml-2 text-gray-400">• Next: {formatTime(nextRefresh)}</span>
            )}
          </p>
        </div>
      </div>
      
      {onRefresh && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onRefresh} 
          disabled={isRefreshing}
          className="text-gray-500 hover:text-indigo-600"
        >
          <ArrowPathIcon className={cx("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      )}
    </div>
  );
};

// ============================================
// EMPTY STATE COMPONENT
// ============================================

interface EmptyStateProps {
  message: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message }) => (
  <div className="py-8 text-center bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
    <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
  </div>
);

// ============================================
// LIVE INDICATOR COMPONENT (Dual Status)
// ============================================

interface LiveIndicatorProps {
  isAutoRefreshEnabled: boolean;
  isSubscribed: boolean;
}

const LiveIndicator: React.FC<LiveIndicatorProps> = ({ isAutoRefreshEnabled, isSubscribed }) => (
  <div className="flex items-center gap-2">
    {/* Scraper auto-refresh status */}
    <div className={cx(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
      isAutoRefreshEnabled 
        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
        : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
    )}>
      <span className={cx(
        "w-2 h-2 rounded-full",
        isAutoRefreshEnabled ? "bg-green-500 animate-pulse" : "bg-amber-500"
      )} />
      {isAutoRefreshEnabled ? 'Auto-Refresh' : 'Manual Only'}
    </div>
    
    {/* WebSocket subscription status */}
    <div className={cx(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
      isSubscribed 
        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" 
        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
    )}>
      <span className={cx(
        "w-2 h-2 rounded-full",
        isSubscribed ? "bg-blue-500 animate-pulse" : "bg-gray-400"
      )} />
      {isSubscribed ? 'Live' : 'Offline'}
    </div>
  </div>
);

// ============================================
// REFRESH STATUS BANNER COMPONENT
// ============================================

interface RefreshStatusBannerProps {
  isAutoRefreshEnabled: boolean;
  lastUpdated: Date | null;
  nextRefresh: Date | null;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  disabledReason?: string | null;
}

const RefreshStatusBanner: React.FC<RefreshStatusBannerProps> = ({
  isAutoRefreshEnabled,
  lastUpdated,
  nextRefresh,
  onManualRefresh,
  isRefreshing,
  disabledReason,
}) => {
  // Calculate time since last update
  const getTimeSinceUpdate = (): string => {
    if (!lastUpdated) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) !== 1 ? 's' : ''} ago`;
  };

  // Calculate time until next refresh
  const getTimeUntilRefresh = (): string => {
    if (!nextRefresh) return '-';
    
    const now = new Date();
    const diffMs = nextRefresh.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Soon';
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ${diffMins % 60} min`;
  };

  if (isAutoRefreshEnabled) {
    // AUTO-REFRESH ON
    return (
      <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              Auto-refresh ON
            </span>
          </div>
          <div className="h-4 w-px bg-green-300 dark:bg-green-700" />
          <div className="flex items-center gap-4 text-sm text-green-700 dark:text-green-400">
            <span>
              <span className="font-medium">{getTimeSinceUpdate()}</span>
              <span className="text-green-600 dark:text-green-500"> since last refresh</span>
            </span>
            <span className="text-green-500 dark:text-green-600">•</span>
            <span>
              <span className="font-medium">{getTimeUntilRefresh()}</span>
              <span className="text-green-600 dark:text-green-500"> to next refresh</span>
            </span>
          </div>
        </div>
        <Button 
          onClick={onManualRefresh} 
          variant="secondary" 
          size="sm" 
          disabled={isRefreshing}
          className="bg-white dark:bg-gray-800 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
        >
          <ArrowPathIcon className={cx("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} />
          Refresh Now
        </Button>
      </div>
    );
  }

  // AUTO-REFRESH OFF
  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500 rounded-full" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Auto-refresh OFF
          </span>
        </div>
        <div className="h-4 w-px bg-amber-300 dark:bg-amber-700" />
        <div className="flex items-center gap-4 text-sm text-amber-700 dark:text-amber-400">
          <span>
            <span className="font-medium">{getTimeSinceUpdate()}</span>
            <span className="text-amber-600 dark:text-amber-500"> since last refresh</span>
          </span>
          {disabledReason && (
            <>
              <span className="text-amber-500 dark:text-amber-600">•</span>
              <span className="text-amber-600 dark:text-amber-500 italic">
                {disabledReason}
              </span>
            </>
          )}
        </div>
      </div>
      <Button 
        onClick={onManualRefresh} 
        variant="secondary" 
        size="sm" 
        disabled={isRefreshing}
        className="bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30"
      >
        <ArrowPathIcon className={cx("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} />
        Manual Refresh
      </Button>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const HomePage: React.FC = () => {
  const { selectedEntities, loading: entityLoading } = useEntity();
  const client = useMemo(() => generateClient(), []);
  
  // Global scraper settings - controls auto-refresh behavior
  const { 
    settings: scraperSettings,
    loading: settingsLoading,
    isAutoRefreshEnabled,
    refreshIntervals,
  } = useScraperSettings();
  
  // Game state - restructured for new sections
  const [runningGames, setRunningGames] = useState<ActiveGameData[]>([]);
  const [clockStoppedGames, setClockStoppedGames] = useState<ActiveGameData[]>([]);
  const [startingSoonGames, setStartingSoonGames] = useState<(ActiveGameData | UpcomingGameData)[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<(ActiveGameData | UpcomingGameData)[]>([]);
  const [finishedGames, setFinishedGames] = useState<FinishedGameData[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Section-specific refresh state
  const [runningRefreshing, setRunningRefreshing] = useState(false);
  const [runningLastRefreshed, setRunningLastRefreshed] = useState<Date | null>(null);
  const [runningNextRefresh, setRunningNextRefresh] = useState<Date | null>(null);
  
  const [startingSoonRefreshing, setStartingSoonRefreshing] = useState(false);
  const [startingSoonLastRefreshed, setStartingSoonLastRefreshed] = useState<Date | null>(null);
  const [startingSoonNextRefresh, setStartingSoonNextRefresh] = useState<Date | null>(null);
  
  const [upcomingRefreshing, setUpcomingRefreshing] = useState(false);
  const [upcomingLastRefreshed, setUpcomingLastRefreshed] = useState<Date | null>(null);
  const [upcomingNextRefresh, setUpcomingNextRefresh] = useState<Date | null>(null);
  
  // Subscription ref
  const subscriptionRef = useRef<AmplifySubscription | null>(null);
  
  // Timer refs for auto-refresh
  const runningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startingSoonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const upcomingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get selected entity IDs
  const entityIds = useMemo(() => selectedEntities.map(e => e.id), [selectedEntities]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchRunningGames = useCallback(async (): Promise<{
    running: ActiveGameData[];
    clockStopped: ActiveGameData[];
  }> => {
    if (entityIds.length === 0) return { running: [], clockStopped: [] };

    try {
      const fetchPromises = entityIds.flatMap(entityId => [
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'RUNNING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'CLOCK_STOPPED' }, limit: 50 }
        })
      ]);

      const results = await Promise.all(fetchPromises);
      
      const running: ActiveGameData[] = [];
      const clockStopped: ActiveGameData[] = [];

      for (let i = 0; i < results.length; i += 2) {
        const runningResult = results[i] as GraphQLResult<ActiveGamesByEntityData>;
        const clockStoppedResult = results[i + 1] as GraphQLResult<ActiveGamesByEntityData>;

        if (runningResult.data?.activeGamesByEntity?.items) {
          running.push(...runningResult.data.activeGamesByEntity.items.filter(Boolean));
        }
        if (clockStoppedResult.data?.activeGamesByEntity?.items) {
          clockStopped.push(...clockStoppedResult.data.activeGamesByEntity.items.filter(Boolean));
        }
      }

      // Sort: First by registration status (OPEN first, then CLOSED), then by gameStartDateTime earliest to latest
      const sortRunningGames = (games: ActiveGameData[]) => {
        return games.sort((a, b) => {
          // Registration status priority: OPEN > FINAL > null/other
          const regOrder = (status: string | null | undefined) => {
            if (status === 'OPEN') return 0;
            if (status === 'FINAL') return 1;
            return 2; // CLOSED or null
          };
          
          const regCompare = regOrder(a.registrationStatus) - regOrder(b.registrationStatus);
          if (regCompare !== 0) return regCompare;
          
          // Within same registration status, sort by start time earliest to latest
          return new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime();
        });
      };

      return {
        running: sortRunningGames(running),
        clockStopped: sortRunningGames(clockStopped)
      };
    } catch (err) {
      console.error('[HomePage] Error fetching running games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchStartingSoonAndUpcoming = useCallback(async (): Promise<{
    startingSoon: (ActiveGameData | UpcomingGameData)[];
    upcoming: (ActiveGameData | UpcomingGameData)[];
  }> => {
    if (entityIds.length === 0) return { startingSoon: [], upcoming: [] };

    try {
      // Fetch from both ActiveGame (INITIATING, REGISTERING, SCHEDULED) and UpcomingGame tables
      const fetchPromises = entityIds.flatMap(entityId => [
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'INITIATING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'REGISTERING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'SCHEDULED' }, limit: 50 }
        }),
        client.graphql({
          query: listUpcomingByEntity,
          variables: { entityId, limit: 50 }
        })
      ]);

      const results = await Promise.all(fetchPromises);
      
      const allGames: (ActiveGameData | UpcomingGameData)[] = [];
      const seenIds = new Set<string>();

      // Process results (4 queries per entity)
      for (let i = 0; i < results.length; i += 4) {
        const initiatingResult = results[i] as GraphQLResult<ActiveGamesByEntityData>;
        const registeringResult = results[i + 1] as GraphQLResult<ActiveGamesByEntityData>;
        const scheduledResult = results[i + 2] as GraphQLResult<ActiveGamesByEntityData>;
        const upcomingResult = results[i + 3] as GraphQLResult<UpcomingGamesByEntityData>;

        // Add from ActiveGame tables (avoiding duplicates)
        [initiatingResult, registeringResult, scheduledResult].forEach(result => {
          if (result.data?.activeGamesByEntity?.items) {
            result.data.activeGamesByEntity.items.filter(Boolean).forEach(game => {
              if (!seenIds.has(game.id)) {
                seenIds.add(game.id);
                allGames.push(game);
              }
            });
          }
        });

        // Add from UpcomingGame table (avoiding duplicates)
        if (upcomingResult.data?.upcomingGamesByEntity?.items) {
          upcomingResult.data.upcomingGamesByEntity.items.filter(Boolean).forEach(game => {
            if (!seenIds.has(game.id)) {
              seenIds.add(game.id);
              allGames.push(game);
            }
          });
        }
      }

      // Filter games that haven't started yet
      const now = new Date();
      const futureGames = allGames.filter(game => {
        const startTime = new Date(game.gameStartDateTime);
        return startTime > now;
      });

      // Split into starting soon (<24h) and upcoming (>24h)
      const startingSoon = futureGames
        .filter(game => isWithin24Hours(game.gameStartDateTime))
        .sort((a, b) => new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime());
      
      const upcoming = futureGames
        .filter(game => isMoreThan24Hours(game.gameStartDateTime))
        .sort((a, b) => new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime());

      return { startingSoon, upcoming };
    } catch (err) {
      console.error('[HomePage] Error fetching starting soon/upcoming games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchFinishedGames = useCallback(async (): Promise<FinishedGameData[]> => {
    if (entityIds.length === 0) return [];

    // Calculate 7 days ago for filtering
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      // Try RecentlyFinishedGame table first
      const fetchPromises = entityIds.map(entityId =>
        client.graphql({
          query: listRecentlyFinishedByEntity,
          variables: { entityId, limit: 100 } // Increased limit since we filter client-side
        })
      );

      const results = await Promise.all(fetchPromises);
      const finished: FinishedGameData[] = [];

      results.forEach(result => {
        const typedResult = result as GraphQLResult<RecentlyFinishedByEntityData>;
        if (typedResult.data?.recentlyFinishedByEntity?.items) {
          finished.push(...typedResult.data.recentlyFinishedByEntity.items.filter(Boolean));
        }
      });

      // CRITICAL FIX: Filter to only include games started in the last 7 days
      const recentFinished = finished.filter(game => {
        const gameStart = new Date(game.gameStartDateTime);
        return gameStart >= sevenDaysAgo;
      });

      // If no recent games found, fall back to GSI query
      if (recentFinished.length === 0) {
        console.log('[HomePage] No recent finished games, falling back to GSI query');

        const fallbackResult = await client.graphql({
          query: gamesByStatusFinished,
          variables: { 
            gameStatus: 'FINISHED', 
            since: sevenDaysAgo.toISOString(),
            limit: 50 
          }
        }) as GraphQLResult<GamesByStatusData>;

        if (fallbackResult.data?.gamesByStatus?.items) {
          const gsiGames = fallbackResult.data.gamesByStatus.items
            .filter(Boolean)
            .filter((g) => !g.entityId || entityIds.includes(g.entityId))
            .map((g): FinishedGameData => ({
              ...g,
              venueName: g.venue?.name ?? null,
              venueLogoCached: g.venue?.logo ?? null
            }));
          return gsiGames;
        }
      }

      // Sort by finished time descending (most recent first)
      return recentFinished.sort((a, b) => {
        const aFinish = a.finishedAt || a.gameEndDateTime || a.gameStartDateTime;
        const bFinish = b.finishedAt || b.gameEndDateTime || b.gameStartDateTime;
        return new Date(bFinish).getTime() - new Date(aFinish).getTime();
      });
    } catch (err) {
      console.error('[HomePage] Error fetching finished games:', err);
      throw err;
    }
  }, [client, entityIds]);

  // ============================================
  // REFRESH HANDLERS
  // ============================================

  const refreshRunningGames = useCallback(async () => {
    setRunningRefreshing(true);
    try {
      const result = await fetchRunningGames();
      setRunningGames(result.running);
      setClockStoppedGames(result.clockStopped);
      setRunningLastRefreshed(new Date());
      
      // Calculate next refresh time (next half hour)
      const nextRefresh = new Date(Date.now() + getMillisecondsUntilNextHalfHour());
      setRunningNextRefresh(nextRefresh);
    } catch (err) {
      console.error('[HomePage] Error refreshing running games:', err);
    } finally {
      setRunningRefreshing(false);
    }
  }, [fetchRunningGames]);

  const refreshStartingSoon = useCallback(async () => {
    setStartingSoonRefreshing(true);
    try {
      const result = await fetchStartingSoonAndUpcoming();
      setStartingSoonGames(result.startingSoon);
      // Don't update upcoming here - it has its own refresh cycle
      setStartingSoonLastRefreshed(new Date());
      
      // Calculate next refresh time (next hour)
      const nextRefresh = new Date(Date.now() + getMillisecondsUntilNextHour());
      setStartingSoonNextRefresh(nextRefresh);
    } catch (err) {
      console.error('[HomePage] Error refreshing starting soon games:', err);
    } finally {
      setStartingSoonRefreshing(false);
    }
  }, [fetchStartingSoonAndUpcoming]);

  const refreshUpcoming = useCallback(async () => {
    setUpcomingRefreshing(true);
    try {
      const result = await fetchStartingSoonAndUpcoming();
      setUpcomingGames(result.upcoming);
      // Also update starting soon since we fetched it anyway
      setStartingSoonGames(result.startingSoon);
      setUpcomingLastRefreshed(new Date());
      
      // Calculate next refresh time (12 hours from now)
      const nextRefresh = new Date(Date.now() + UPCOMING_REFRESH_INTERVAL);
      setUpcomingNextRefresh(nextRefresh);
    } catch (err) {
      console.error('[HomePage] Error refreshing upcoming games:', err);
    } finally {
      setUpcomingRefreshing(false);
    }
  }, [fetchStartingSoonAndUpcoming]);

  const fetchAllData = useCallback(async (triggerScraper: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      // Optionally trigger the scraper Lambda first
      if (triggerScraper) {
        console.log('[HomePage] Triggering refreshRunningGames Lambda...');
        
        const refreshResult = await client.graphql({
          query: refreshRunningGamesMutation,
          variables: { 
            input: { 
              entityId: entityIds.length === 1 ? entityIds[0] : null,
              maxGames: 50,
              olderThanMinutes: 0  // Refresh all, not just stale ones
            } 
          }
        }) as GraphQLResult<RefreshRunningGamesData>;

        if (refreshResult.data?.refreshRunningGames) {
          const result = refreshResult.data.refreshRunningGames;
          console.log('[HomePage] Refresh result:', {
            success: result.success,
            refreshed: result.gamesRefreshed,
            updated: result.gamesUpdated,
            failed: result.gamesFailed,
            timeMs: result.executionTimeMs
          });
          
          if (result.errors?.length) {
            console.warn('[HomePage] Refresh errors:', result.errors);
          }
        }

        // Brief delay to allow DynamoDB to propagate updates
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Fetch data from database
      const [runningResult, startingUpcomingResult, finished] = await Promise.all([
        fetchRunningGames(),
        fetchStartingSoonAndUpcoming(),
        fetchFinishedGames()
      ]);

      console.log('[fetchAllData] Results received:', {
        running: runningResult.running.length,
        clockStopped: runningResult.clockStopped.length,
        startingSoon: startingUpcomingResult.startingSoon.length,
        upcoming: startingUpcomingResult.upcoming.length,
        finished: finished.length
      });

      setRunningGames(runningResult.running);
      setClockStoppedGames(runningResult.clockStopped);
      setStartingSoonGames(startingUpcomingResult.startingSoon);
      setUpcomingGames(startingUpcomingResult.upcoming);
      setFinishedGames(finished);
      
      console.log('[fetchAllData] State updated successfully');
      
      const now = new Date();
      setLastUpdated(now);
      setRunningLastRefreshed(now);
      setStartingSoonLastRefreshed(now);
      setUpcomingLastRefreshed(now);
      
      // Set next refresh times
      setRunningNextRefresh(new Date(Date.now() + getMillisecondsUntilNextHalfHour()));
      setStartingSoonNextRefresh(new Date(Date.now() + getMillisecondsUntilNextHour()));
      setUpcomingNextRefresh(new Date(Date.now() + UPCOMING_REFRESH_INTERVAL));
      
    } catch (err) {
      console.error('[fetchAllData] ERROR:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [client, entityIds, fetchRunningGames, fetchStartingSoonAndUpcoming, fetchFinishedGames]);

  // Handler for manual refresh that triggers the scraper
  const handleManualRefresh = useCallback(() => {
    fetchAllData(true); // true = trigger scraper Lambda first
  }, [fetchAllData]);

  // ============================================
  // AUTO-REFRESH SETUP
  // ============================================

  useEffect(() => {
    // Clear any existing timers first
    const clearAllTimers = () => {
      if (runningTimerRef.current) {
        clearTimeout(runningTimerRef.current);
        clearInterval(runningTimerRef.current);
        runningTimerRef.current = null;
      }
      if (startingSoonTimerRef.current) {
        clearTimeout(startingSoonTimerRef.current);
        clearInterval(startingSoonTimerRef.current);
        startingSoonTimerRef.current = null;
      }
      if (upcomingTimerRef.current) {
        clearInterval(upcomingTimerRef.current);
        upcomingTimerRef.current = null;
      }
    };

    clearAllTimers();

    // Don't setup auto-refresh if:
    // - Entity is still loading
    // - No entities selected
    // - Auto-refresh is disabled in settings
    // - Settings are still loading
    if (entityLoading || entityIds.length === 0 || settingsLoading) {
      return clearAllTimers;
    }

    if (!isAutoRefreshEnabled) {
      console.log('[HomePage] Auto-refresh is DISABLED - skipping timer setup');
      // Clear next refresh times when disabled
      setRunningNextRefresh(null);
      setStartingSoonNextRefresh(null);
      setUpcomingNextRefresh(null);
      return clearAllTimers;
    }

    console.log('[HomePage] Auto-refresh is ENABLED - setting up timers');
    console.log('[HomePage] Refresh intervals:', refreshIntervals);

    // Convert refresh intervals from minutes to milliseconds
    const runningIntervalMs = refreshIntervals.running * 60 * 1000;
    const startingSoonIntervalMs = refreshIntervals.startingSoon * 60 * 1000;
    const upcomingIntervalMs = refreshIntervals.upcoming * 60 * 1000;

    // Setup running games auto-refresh (clock-aligned to half hour)
    const setupRunningRefresh = () => {
      const msUntilNextHalfHour = getMillisecondsUntilNextHalfHour();
      
      runningTimerRef.current = setTimeout(() => {
        refreshRunningGames();
        runningTimerRef.current = setInterval(refreshRunningGames, runningIntervalMs);
      }, msUntilNextHalfHour);
      
      // Set next refresh time
      setRunningNextRefresh(new Date(Date.now() + msUntilNextHalfHour));
    };

    // Setup starting soon auto-refresh (clock-aligned to hour)
    const setupStartingSoonRefresh = () => {
      const msUntilNextHour = getMillisecondsUntilNextHour();
      
      startingSoonTimerRef.current = setTimeout(() => {
        refreshStartingSoon();
        startingSoonTimerRef.current = setInterval(refreshStartingSoon, startingSoonIntervalMs);
      }, msUntilNextHour);
      
      setStartingSoonNextRefresh(new Date(Date.now() + msUntilNextHour));
    };

    // Setup upcoming games auto-refresh
    const setupUpcomingRefresh = () => {
      upcomingTimerRef.current = setInterval(refreshUpcoming, upcomingIntervalMs);
      setUpcomingNextRefresh(new Date(Date.now() + upcomingIntervalMs));
    };

    setupRunningRefresh();
    setupStartingSoonRefresh();
    setupUpcomingRefresh();

    return clearAllTimers;
  }, [
    entityLoading, 
    entityIds, 
    settingsLoading,
    isAutoRefreshEnabled, 
    refreshIntervals,
    refreshRunningGames, 
    refreshStartingSoon, 
    refreshUpcoming
  ]);

  // ============================================
  // SUBSCRIPTION SETUP
  // ============================================

  const setupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    try {
      const subscriptionObservable = client.graphql({
        query: onActiveGameChangeSubscription,
        variables: entityIds.length === 1 ? { entityId: entityIds[0] } : {}
      });

      const observable = subscriptionObservable as unknown as {
        subscribe: (handlers: {
          next: (value: { data?: OnActiveGameChangeData }) => void;
          error: (error: Error) => void;
        }) => AmplifySubscription;
      };

      const subscription = observable.subscribe({
        next: ({ data }) => {
          if (data?.onActiveGameChange) {
            const updatedGame = data.onActiveGameChange;
            console.log('[HomePage] Received active game update:', updatedGame.name, updatedGame.gameStatus);
            
            const updateLists = () => {
              switch (updatedGame.gameStatus) {
                case 'RUNNING':
                  setRunningGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    const updated = [updatedGame, ...filtered];
                    // Re-sort by registration status then start time
                    return updated.sort((a, b) => {
                      const regOrder = (status: string | null | undefined) => {
                        if (status === 'OPEN') return 0;
                        if (status === 'FINAL') return 1;
                        return 2;
                      };
                      const regCompare = regOrder(a.registrationStatus) - regOrder(b.registrationStatus);
                      if (regCompare !== 0) return regCompare;
                      return new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime();
                    });
                  });
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setStartingSoonGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'CLOCK_STOPPED':
                  setClockStoppedGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'REGISTERING':
                case 'INITIATING':
                case 'SCHEDULED':
                  // Check if it should be in starting soon or upcoming
                  if (isWithin24Hours(updatedGame.gameStartDateTime)) {
                    setStartingSoonGames(prev => {
                      const filtered = prev.filter(g => g.id !== updatedGame.id);
                      const updated = [updatedGame, ...filtered];
                      return updated.sort((a, b) => 
                        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
                      );
                    });
                  } else {
                    setUpcomingGames(prev => {
                      const filtered = prev.filter(g => g.id !== updatedGame.id);
                      const updated = [updatedGame, ...filtered];
                      return updated.sort((a, b) => 
                        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
                      );
                    });
                  }
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'FINISHED':
                case 'CANCELLED':
                  // Remove from all active lists
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setStartingSoonGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setUpcomingGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  // Refresh finished games
                  fetchFinishedGames().then(setFinishedGames).catch(console.error);
                  break;
              }
            };
            
            updateLists();
            setLastUpdated(new Date());
          }
        },
        error: (err: Error) => {
          console.error('[HomePage] Subscription error:', err);
          setIsSubscribed(false);
        }
      });

      subscriptionRef.current = subscription;
      setIsSubscribed(true);
    } catch (err) {
      console.error('[HomePage] Failed to setup subscription:', err);
      setIsSubscribed(false);
    }
  }, [client, entityIds, fetchFinishedGames]);

  // ============================================
  // EFFECTS
  // ============================================

  // Fetch data when entities change
  useEffect(() => {
    if (!entityLoading && entityIds.length > 0) {
      fetchAllData(false); // false = don't trigger scraper on initial load
    }
  }, [entityLoading, entityIds, fetchAllData]);

  // Setup subscription
  useEffect(() => {
    if (!entityLoading && entityIds.length > 0) {
      setupSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [entityLoading, entityIds, setupSubscription]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const totalPrizepool = useMemo(() => 
    finishedGames.reduce((sum, g) => sum + (g.prizepoolPaid || g.prizepoolCalculated || 0), 0),
    [finishedGames]
  );
  
  // Combined running games count (RUNNING + CLOCK_STOPPED)
  const totalRunningCount = runningGames.length + clockStoppedGames.length;

  // ============================================
  // RENDER
  // ============================================

  if (loading && !lastUpdated) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tournament overview and live updates</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading dashboard…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tournament overview and live updates</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator 
            isAutoRefreshEnabled={isAutoRefreshEnabled} 
            isSubscribed={isSubscribed} 
          />
        </div>
      </div>

      {/* Auto-Refresh Status Banner */}
      <RefreshStatusBanner
        isAutoRefreshEnabled={isAutoRefreshEnabled}
        lastUpdated={lastUpdated}
        nextRefresh={runningNextRefresh}
        onManualRefresh={handleManualRefresh}
        isRefreshing={loading}
        disabledReason={scraperSettings?.disabledReason}
      />

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-5 mb-8">
        <KpiCard
          title="Running"
          value={totalRunningCount}
          icon={<PlayIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Starting Soon"
          value={startingSoonGames.length}
          icon={<ClockIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Upcoming"
          value={upcomingGames.length}
          icon={<CalendarIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Finished (7d)"
          value={finishedGames.length}
          icon={<CheckCircleIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Prizepool (7d)"
          value={formatCurrency(totalPrizepool)}
          icon={<TrophyIcon className="h-5 w-5" />}
        />
      </div>

      {/* Section 1: Running Games (RUNNING + CLOCK_STOPPED) */}
      <section className="mb-10">
        <SectionHeader
          title="Running Games"
          count={totalRunningCount}
          icon={<PlayIcon className="w-5 h-5" />}
          colorClass="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
          onRefresh={refreshRunningGames}
          isRefreshing={runningRefreshing}
          lastRefreshed={runningLastRefreshed}
          nextRefresh={runningNextRefresh}
        />
        {totalRunningCount === 0 ? (
          <EmptyState message="No games currently running" />
        ) : (
          <>
            {/* Running games with registration OPEN first */}
            {runningGames.length > 0 && (
              <HorizontalScrollRow>
                {runningGames.map((game) => (
                  <GameCard key={game.id} game={game} variant="running" />
                ))}
              </HorizontalScrollRow>
            )}
            
            {/* Clock stopped games */}
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
          </>
        )}
      </section>

      {/* Section 2: Starting Soon (<24 hours) */}
      <section className="mb-10">
        <SectionHeader
          title="Starting Soon"
          count={startingSoonGames.length}
          icon={<ClockIcon className="w-5 h-5" />}
          colorClass="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
          onRefresh={refreshStartingSoon}
          isRefreshing={startingSoonRefreshing}
          lastRefreshed={startingSoonLastRefreshed}
          nextRefresh={startingSoonNextRefresh}
        />
        {startingSoonGames.length === 0 ? (
          <EmptyState message="No games starting in the next 24 hours" />
        ) : (
          <HorizontalScrollRow>
            {startingSoonGames.map((game) => (
              <GameCard key={game.id} game={game} variant="startingSoon" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>

      {/* Section 3: Upcoming Games (>24 hours) */}
      <section className="mb-10">
        <SectionHeader
          title="Upcoming Games"
          count={upcomingGames.length}
          icon={<CalendarIcon className="w-5 h-5" />}
          colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          onRefresh={refreshUpcoming}
          isRefreshing={upcomingRefreshing}
          lastRefreshed={upcomingLastRefreshed}
          nextRefresh={upcomingNextRefresh}
        />
        {upcomingGames.length === 0 ? (
          <EmptyState message="No upcoming games scheduled" />
        ) : (
          <HorizontalScrollRow>
            {upcomingGames.map((game) => (
              <GameCard key={game.id} game={game} variant="upcoming" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>

      {/* Section 4: Recently Finished */}
      <section className="mb-10">
        <SectionHeader
          title="Recently Finished"
          count={finishedGames.length}
          icon={<CheckCircleIcon className="w-5 h-5" />}
          colorClass="bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400"
        />
        {finishedGames.length === 0 ? (
          <EmptyState message="No games finished in the last 7 days" />
        ) : (
          <HorizontalScrollRow>
            {finishedGames.map((game) => (
              <GameCard key={game.id} game={game} variant="finished" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>
    </>
  );
};

export default HomePage;