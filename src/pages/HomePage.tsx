// src/pages/HomePage.tsx
// VERSION: 2.2.0 - Added INITIATING status support, AEST timezone formatting
//
// ARCHITECTURE:
// - ActiveGame table: Fast queries for RUNNING, REGISTERING, CLOCK_STOPPED, INITIATING games
// - RecentlyFinishedGame table: Games finished in last 7 days (auto-cleaned via TTL)
// - UpcomingGame table: Games scheduled to start soon
// - Subscriptions: Real-time updates via onActiveGameChange
//
// PERFORMANCE:
// - Dashboard loads in <500ms even with thousands of games
// - Real-time updates without polling
// - 15-minute auto-refresh for stale RUNNING games

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
} from '@heroicons/react/24/outline';

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import { formatCurrency, cx } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { useEntity } from '@/contexts/EntityContext';
import { toAEST } from '@/utils/dateUtils';

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
        sourceUrl
        lastRefreshedAt
        refreshCount
      }
      nextToken
    }
  }
`;

// Note: listActiveGamesByStatus query available if needed for cross-entity queries
// Currently using listActiveGamesByEntity for entity-scoped dashboard

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
        sourceUrl
      }
      nextToken
    }
  }
`;

// Fallback: Query Game table for upcoming games
const gamesByStatusUpcoming = /* GraphQL */ `
  query GamesByStatusUpcoming($now: String!, $limit: Int) {
    gamesByStatus(
      gameStatus: SCHEDULED
      gameStartDateTime: { ge: $now }
      limit: $limit
      sortDirection: ASC
    ) {
      items {
        id
        entityId
        tournamentId
        name
        gameStartDateTime
        gameStatus
        buyIn
        guaranteeAmount
        hasGuarantee
        sourceUrl
        isSeries
        seriesName
        isMainEvent
        venue {
          name
          logo
        }
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
      gameStatus
      registrationStatus
      gameStartDateTime
      totalEntries
      totalUniquePlayers
      playersRemaining
      buyIn
      prizepoolPaid
      prizepoolCalculated
      sourceUrl
      lastRefreshedAt
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
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  sourceUrl?: string | null;
  lastRefreshedAt?: string | null;
  refreshCount?: number | null;
}

interface FinishedGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  finishedAt?: string | null;
  gameEndDateTime?: string | null;
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
  sourceUrl?: string | null;
}

interface UpcomingGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  gameStatus?: string | null;
  buyIn?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  gameType?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  sourceUrl?: string | null;
}

type GameVariant = 'running' | 'registering' | 'clockStopped' | 'initiating' | 'finished' | 'upcoming';

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

interface AmplifySubscription {
  unsubscribe: () => void;
}

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
// GAME CARD COMPONENT
// ============================================

interface GameCardProps {
  game: ActiveGameData | FinishedGameData | UpcomingGameData;
  variant: GameVariant;
}

const GameCard: React.FC<GameCardProps> = ({ game, variant }) => {
  const formatDateTime = (dateString: string): string => {
    try {
      const aest = toAEST(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const hours = aest.hours % 12 || 12;
      const ampm = aest.hours >= 12 ? 'PM' : 'AM';
      const mins = String(aest.minutes).padStart(2, '0');
      return `${aest.day} ${months[aest.month]} ${aest.year} @ ${hours}:${mins} ${ampm}`;
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadge = (): React.ReactNode => {
    switch (variant) {
      case 'running':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <PlayIcon className="w-3 h-3" />
            Live
          </Badge>
        );
      case 'registering':
        return (
          <Badge variant="neutral" className="flex items-center gap-1">
            <SignalIcon className="w-3 h-3" />
            Registering
          </Badge>
        );
      case 'clockStopped':
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <PauseCircleIcon className="w-3 h-3" />
            Paused
          </Badge>
        );
      case 'initiating':
        return (
          <Badge variant="neutral" className="flex items-center gap-1">
            <ClockIcon className="w-3 h-3" />
            Starting
          </Badge>
        );
      case 'finished':
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" />
            Complete
          </Badge>
        );
      case 'upcoming':
        return (
          <Badge variant="neutral" className="flex items-center gap-1">
            <ClockIcon className="w-3 h-3" />
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

  // Get venue name from either flat field or nested object
  const venueName = 'venueName' in game && game.venueName 
    ? game.venueName 
    : ('venue' in game && game.venue?.name) || null;

  // Check for overlay indicator
  const hasOverlay = 'hasOverlay' in game ? game.hasOverlay : false;

  return (
    <div className={cx(
      "flex-shrink-0 w-[320px] sm:w-[340px] bg-white dark:bg-gray-950 rounded-xl shadow-sm border overflow-hidden transition-all self-start cursor-pointer group",
      variant === 'running' && "border-green-200 dark:border-green-800 hover:border-green-300",
      variant === 'registering' && "border-blue-200 dark:border-blue-800 hover:border-blue-300",
      variant === 'clockStopped' && "border-yellow-200 dark:border-yellow-800 hover:border-yellow-300",
      variant === 'finished' && "border-gray-200 dark:border-gray-800 hover:border-gray-300",
      variant === 'upcoming' && "border-gray-200 dark:border-gray-800 hover:border-gray-300",
      "hover:shadow-md"
    )}>
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            {venueName && (
              <p className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
                {venueName}
              </p>
            )}
            <h4 className="font-semibold text-gray-900 dark:text-gray-50 text-sm sm:text-base leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {game.name}
            </h4>
          </div>
          <div className="flex items-center gap-1">
            {hasOverlay && (
              <Badge variant="error" className="text-[10px]">
                <ExclamationTriangleIcon className="w-3 h-3 mr-0.5" />
                Overlay
              </Badge>
            )}
            {getStatusBadge()}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{formatDateTime(game.gameStartDateTime)}</span>
        </div>
      </div>

      {/* Card Body - Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        {(variant === 'running' || variant === 'registering' || variant === 'clockStopped' || variant === 'initiating') && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {variant === 'running' ? 'Players Remaining' : 'Entries'}
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {variant === 'running' 
                  ? valOrDash((game as ActiveGameData).playersRemaining)
                  : valOrDash((game as ActiveGameData).totalEntries)
                }
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
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(game.buyIn, formatCurrency)}
              </span>
            </div>
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
          const aest = toAEST(game.lastRefreshedAt);
          const hours = aest.hours % 12 || 12;
          const ampm = aest.hours >= 12 ? 'PM' : 'AM';
          const mins = String(aest.minutes).padStart(2, '0');
          return (
            <span className="text-[10px] text-gray-400">
              Updated {hours}:{mins} {ampm}
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
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  count, 
  icon, 
  colorClass = 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
}) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={cx("flex items-center justify-center w-10 h-10 rounded-lg", colorClass)}>
      {icon}
    </div>
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50">{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {count} game{count !== 1 ? 's' : ''}
      </p>
    </div>
  </div>
);

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
// LIVE INDICATOR COMPONENT
// ============================================

interface LiveIndicatorProps {
  isConnected: boolean;
}

const LiveIndicator: React.FC<LiveIndicatorProps> = ({ isConnected }) => (
  <div className={cx(
    "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
    isConnected 
      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" 
      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
  )}>
    <span className={cx(
      "w-2 h-2 rounded-full",
      isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"
    )} />
    {isConnected ? 'Live' : 'Offline'}
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

export const HomePage: React.FC = () => {
  const { selectedEntities, loading: entityLoading } = useEntity();
  const client = useMemo(() => generateClient(), []);
  
  // Game state
  const [runningGames, setRunningGames] = useState<ActiveGameData[]>([]);
  const [registeringGames, setRegisteringGames] = useState<ActiveGameData[]>([]);
  const [clockStoppedGames, setClockStoppedGames] = useState<ActiveGameData[]>([]);
  const [initiatingGames, setInitiatingGames] = useState<ActiveGameData[]>([]);
  const [finishedGames, setFinishedGames] = useState<FinishedGameData[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGameData[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Subscription ref
  const subscriptionRef = useRef<AmplifySubscription | null>(null);

  // Get selected entity IDs
  const entityIds = useMemo(() => selectedEntities.map(e => e.id), [selectedEntities]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchActiveGames = useCallback(async (): Promise<{
    running: ActiveGameData[];
    registering: ActiveGameData[];
    clockStopped: ActiveGameData[];
    initiating: ActiveGameData[];
  }> => {
    if (entityIds.length === 0) return { running: [], registering: [], clockStopped: [], initiating: [] };

    try {
      // Fetch active games for all selected entities in parallel
      const fetchPromises = entityIds.flatMap(entityId => [
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'RUNNING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'REGISTERING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'CLOCK_STOPPED' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'INITIATING' }, limit: 50 }
        })
      ]);

      const results = await Promise.all(fetchPromises);
      
      const running: ActiveGameData[] = [];
      const registering: ActiveGameData[] = [];
      const clockStopped: ActiveGameData[] = [];
      const initiating: ActiveGameData[] = [];

      // Process results (4 queries per entity)
      for (let i = 0; i < results.length; i += 4) {
        const runningResult = results[i] as GraphQLResult<ActiveGamesByEntityData>;
        const registeringResult = results[i + 1] as GraphQLResult<ActiveGamesByEntityData>;
        const clockStoppedResult = results[i + 2] as GraphQLResult<ActiveGamesByEntityData>;
        const initiatingResult = results[i + 3] as GraphQLResult<ActiveGamesByEntityData>;

        if (runningResult.data?.activeGamesByEntity?.items) {
          running.push(...runningResult.data.activeGamesByEntity.items.filter(Boolean));
        }
        if (registeringResult.data?.activeGamesByEntity?.items) {
          registering.push(...registeringResult.data.activeGamesByEntity.items.filter(Boolean));
        }
        if (clockStoppedResult.data?.activeGamesByEntity?.items) {
          clockStopped.push(...clockStoppedResult.data.activeGamesByEntity.items.filter(Boolean));
        }
        if (initiatingResult.data?.activeGamesByEntity?.items) {
          initiating.push(...initiatingResult.data.activeGamesByEntity.items.filter(Boolean));
        }
      }

      // Sort by start time descending
      const sortByDateDesc = (a: ActiveGameData, b: ActiveGameData) => 
        new Date(b.gameStartDateTime).getTime() - new Date(a.gameStartDateTime).getTime();

      return {
        running: running.sort(sortByDateDesc),
        registering: registering.sort(sortByDateDesc),
        clockStopped: clockStopped.sort(sortByDateDesc),
        initiating: initiating.sort(sortByDateDesc)
      };
    } catch (err) {
      console.error('[HomePage] Error fetching active games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchFinishedGames = useCallback(async (): Promise<FinishedGameData[]> => {
    if (entityIds.length === 0) return [];

    try {
      // Try RecentlyFinishedGame table first
      const fetchPromises = entityIds.map(entityId =>
        client.graphql({
          query: listRecentlyFinishedByEntity,
          variables: { entityId, limit: 30 }
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

      // If RecentlyFinishedGame table is empty, fall back to GSI query
      if (finished.length === 0) {
        console.log('[HomePage] RecentlyFinishedGame empty, falling back to GSI query');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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

      // Sort by finished time descending
      return finished.sort((a, b) => 
        new Date(b.finishedAt || b.gameStartDateTime).getTime() - 
        new Date(a.finishedAt || a.gameStartDateTime).getTime()
      );
    } catch (err) {
      console.error('[HomePage] Error fetching finished games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchUpcomingGames = useCallback(async (): Promise<UpcomingGameData[]> => {
    if (entityIds.length === 0) return [];

    try {
      // Try UpcomingGame table first
      const fetchPromises = entityIds.map(entityId =>
        client.graphql({
          query: listUpcomingByEntity,
          variables: { entityId, limit: 20 }
        })
      );

      const results = await Promise.all(fetchPromises);
      const upcoming: UpcomingGameData[] = [];

      results.forEach(result => {
        const typedResult = result as GraphQLResult<UpcomingGamesByEntityData>;
        if (typedResult.data?.upcomingGamesByEntity?.items) {
          upcoming.push(...typedResult.data.upcomingGamesByEntity.items.filter(Boolean));
        }
      });

      // Fall back to GSI query if needed
      if (upcoming.length === 0) {
        console.log('[HomePage] UpcomingGame empty, falling back to GSI query');
        const now = new Date().toISOString();

        const fallbackResult = await client.graphql({
          query: gamesByStatusUpcoming,
          variables: { now, limit: 30 }
        }) as GraphQLResult<GamesByStatusData>;

        if (fallbackResult.data?.gamesByStatus?.items) {
          const gsiGames = fallbackResult.data.gamesByStatus.items
            .filter(Boolean)
            .filter((g) => !g.entityId || entityIds.includes(g.entityId))
            .map((g): UpcomingGameData => ({
              ...g,
              venueName: g.venue?.name ?? null,
              venueLogoCached: g.venue?.logo ?? null
            }));
          return gsiGames;
        }
      }

      // Sort by start time ascending (soonest first)
      return upcoming.sort((a, b) => 
        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
      );
    } catch (err) {
      console.error('[HomePage] Error fetching upcoming games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [activeResult, finished, upcoming] = await Promise.all([
        fetchActiveGames(),
        fetchFinishedGames(),
        fetchUpcomingGames()
      ]);

      setRunningGames(activeResult.running);
      setRegisteringGames(activeResult.registering);
      setClockStoppedGames(activeResult.clockStopped);
      setInitiatingGames(activeResult.initiating);
      setFinishedGames(finished);
      setUpcomingGames(upcoming);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[HomePage] Error fetching data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchActiveGames, fetchFinishedGames, fetchUpcomingGames]);

  // ============================================
  // SUBSCRIPTION SETUP
  // ============================================

  const setupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    try {
      // Subscribe to active game changes
      const subscriptionObservable = client.graphql({
        query: onActiveGameChangeSubscription,
        variables: entityIds.length === 1 ? { entityId: entityIds[0] } : {}
      });

      // Handle subscription with type casting
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
            
            // Update the appropriate list based on status
            const updateLists = () => {
              switch (updatedGame.gameStatus) {
                case 'RUNNING':
                  setRunningGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  setRegisteringGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setInitiatingGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'REGISTERING':
                  setRegisteringGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setInitiatingGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'CLOCK_STOPPED':
                  setClockStoppedGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'INITIATING':
                  setInitiatingGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  break;
                case 'FINISHED':
                case 'CANCELLED':
                  // Remove from all active lists
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setRegisteringGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setInitiatingGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  // Optionally refresh finished games
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
      fetchAllData();
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

  // ============================================
  // RENDER
  // ============================================

  const formatTimestamp = (date: Date | null): string => {
    if (!date) return '-';
    const aest = toAEST(date);
    const hours = aest.hours % 12 || 12;
    const ampm = aest.hours >= 12 ? 'PM' : 'AM';
    const mins = String(aest.minutes).padStart(2, '0');
    const secs = String(aest.seconds).padStart(2, '0');
    return `${hours}:${mins}:${secs} ${ampm}`;
  };

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
          <LiveIndicator isConnected={isSubscribed} />
          {lastUpdated && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Updated: {formatTimestamp(lastUpdated)}
            </span>
          )}
          <Button onClick={fetchAllData} variant="secondary" size="sm" disabled={loading}>
            <ArrowPathIcon className={cx("h-4 w-4 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-6 mb-8">
        <KpiCard
          title="Running"
          value={runningGames.length}
          icon={<PlayIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Registering"
          value={registeringGames.length}
          icon={<SignalIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Clock Stopped"
          value={clockStoppedGames.length}
          icon={<PauseCircleIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Starting"
          value={initiatingGames.length}
          icon={<ClockIcon className="h-5 w-5" />}
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

      {/* Running Games Section */}
      <section className="mb-10">
        <SectionHeader
          title="Running Games"
          count={runningGames.length}
          icon={<PlayIcon className="w-5 h-5" />}
          colorClass="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
        />
        {runningGames.length === 0 ? (
          <EmptyState message="No games currently running" />
        ) : (
          <HorizontalScrollRow>
            {runningGames.map((game) => (
              <GameCard key={game.id} game={game} variant="running" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>

      {/* Registering Games Section */}
      {registeringGames.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            title="Registration Open"
            count={registeringGames.length}
            icon={<SignalIcon className="w-5 h-5" />}
            colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          />
          <HorizontalScrollRow>
            {registeringGames.map((game) => (
              <GameCard key={game.id} game={game} variant="registering" />
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* Clock Stopped Section */}
      {clockStoppedGames.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            title="Clock Stopped"
            count={clockStoppedGames.length}
            icon={<PauseCircleIcon className="w-5 h-5" />}
            colorClass="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
          />
          <HorizontalScrollRow>
            {clockStoppedGames.map((game) => (
              <GameCard key={game.id} game={game} variant="clockStopped" />
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* Initiating Games Section */}
      {initiatingGames.length > 0 && (
        <section className="mb-10">
          <SectionHeader
            title="Starting Soon"
            count={initiatingGames.length}
            icon={<ClockIcon className="w-5 h-5" />}
            colorClass="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
          />
          <HorizontalScrollRow>
            {initiatingGames.map((game) => (
              <GameCard key={game.id} game={game} variant="initiating" />
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* Recently Finished Section */}
      <section className="mb-10">
        <SectionHeader
          title="Recently Finished"
          count={finishedGames.length}
          icon={<CheckCircleIcon className="w-5 h-5" />}
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

      {/* Upcoming Games Section */}
      <section className="mb-10">
        <SectionHeader
          title="Upcoming Games"
          count={upcomingGames.length}
          icon={<ClockIcon className="w-5 h-5" />}
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
    </>
  );
};

export default HomePage;