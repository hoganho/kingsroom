// src/pages/HomePage.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import {
  ArrowPathIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';

import { getClient } from '../utils/apiClient';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';

// ============================================
// TYPES
// ============================================

interface Tournament {
  id: string;
  tournamentId?: number;
  name: string;
  gameStartDateTime: string;
  gameEndDateTime?: string;
  gameStatus: string;
  playersRemaining?: number;
  totalUniquePlayers?: number;
  totalInitialEntries?: number;
  totalEntries?: number;
  prizepoolPaid?: number;
  prizepoolCalculated?: number;
  buyIn?: number;
  venue?: {
    name: string;
  };
  sourceUrl?: string;
}

// ============================================
// HORIZONTAL SCROLL ROW COMPONENT
// ============================================

const HorizontalScrollRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      {/* Left scroll button */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 z-10 -ml-3">
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right scroll button */}
      <div className="absolute top-1/2 -translate-y-1/2 right-0 z-10 -mr-3">
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-4 px-1 scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ============================================
// TOURNAMENT CARD COMPONENT
// ============================================

interface TournamentCardProps {
  tournament: Tournament;
  variant: 'running' | 'finished' | 'upcoming';
}

const TournamentCard: React.FC<TournamentCardProps> = ({ tournament, variant }) => {
  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd MMM yyyy '@' HH:mm");
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadge = () => {
    switch (variant) {
      case 'running':
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <PlayIcon className="w-3 h-3" />
            Live
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
          <Badge variant="warning" className="flex items-center gap-1">
            <ClockIcon className="w-3 h-3" />
            Upcoming
          </Badge>
        );
    }
  };

  const valOrDash = (value: number | null | undefined, formatter?: (v: number) => string): string => {
    if (value === null || value === undefined || value === 0) return '-';
    return formatter ? formatter(value) : value.toLocaleString();
  };

  return (
    <div className="flex-shrink-0 w-[320px] sm:w-[340px] bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all self-start cursor-pointer group">
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            {tournament.venue?.name && (
              <p className="text-[10px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
                {tournament.venue.name}
              </p>
            )}
            <h4 className="font-semibold text-gray-900 dark:text-gray-50 text-sm sm:text-base leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {tournament.name}
            </h4>
          </div>
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{formatDateTime(tournament.gameStartDateTime)}</span>
        </div>
      </div>

      {/* Card Body - Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
        {variant === 'running' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Players Remaining</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.playersRemaining)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total Entries</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.totalEntries)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Unique Players</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.totalUniquePlayers)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.buyIn, formatCurrency)}
              </span>
            </div>
          </>
        )}

        {variant === 'finished' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prizepool Paid</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {valOrDash(tournament.prizepoolPaid, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prizepool Calc</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.prizepoolCalculated, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total Entries</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.totalEntries)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.buyIn, formatCurrency)}
              </span>
            </div>
          </>
        )}

        {variant === 'upcoming' && (
          <>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Buy-in</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {valOrDash(tournament.buyIn, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
              <span className="font-semibold text-gray-900 dark:text-gray-50">
                {tournament.gameStatus?.replace('_', ' ') || '-'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Card Footer - Link to source */}
      {tournament.sourceUrl && (
        <div className="px-4 pb-3">
          <a
            href={tournament.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline"
          >
            View on source →
          </a>
        </div>
      )}
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
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, count, icon }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
      {icon}
    </div>
    <div>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50">{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {count} tournament{count !== 1 ? 's' : ''}
      </p>
    </div>
  </div>
);

// ============================================
// EMPTY STATE COMPONENT
// ============================================

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="py-8 text-center bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
    <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

export const HomePage = () => {
  const [runningTournaments, setRunningTournaments] = useState<Tournament[]>([]);
  const [finishedTournaments, setFinishedTournaments] = useState<Tournament[]>([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTournaments = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const now = new Date().toISOString();

      // Running tournaments (status = 'Running' or 'Registering')
      const runningResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListRunningGames {
            listGames(
              filter: {
                or: [{ gameStatus: { eq: RUNNING } }, { gameStatus: { eq: REGISTERING } }]
              }
              limit: 20
            ) {
              items {
                id
                tournamentId
                name
                gameStartDateTime
                gameStatus
                playersRemaining
                totalUniquePlayers
                totalInitialEntries
                totalEntries
                buyIn
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
      });

      // Finished tournaments (status = 'Complete' in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const finishedResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListFinishedGames($since: String) {
            listGames(
              filter: { gameStatus: { eq: FINISHED }, gameEndDateTime: { gt: $since } }
              limit: 20
            ) {
              items {
                id
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
                venue {
                  name
                }
              }
            }
          }
        `,
        variables: { since: sevenDaysAgo.toISOString() },
      });

      // Upcoming tournaments (status = 'Registration Open' or future start date)
      const upcomingResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListUpcomingGames($now: String) {
            listGames(
              filter: {
                or: [{ gameStatus: { eq: REGISTERING } }, { gameStartDateTime: { gt: $now } }]
              }
              limit: 20
            ) {
              items {
                id
                tournamentId
                name
                gameStartDateTime
                gameStatus
                buyIn
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
        variables: { now },
      });

      // Sort by gameStartDateTime descending (most recent first)
      const sortByDateDesc = (a: Tournament, b: Tournament) => {
        const dateA = new Date(a.gameStartDateTime).getTime();
        const dateB = new Date(b.gameStartDateTime).getTime();
        return dateB - dateA;
      };

      if ('data' in runningResponse && runningResponse.data) {
        const sorted = (runningResponse.data.listGames.items.filter(Boolean) as Tournament[]).sort(
          sortByDateDesc
        );
        setRunningTournaments(sorted);
      }
      if ('data' in finishedResponse && finishedResponse.data) {
        const sorted = (finishedResponse.data.listGames.items.filter(Boolean) as Tournament[]).sort(
          sortByDateDesc
        );
        setFinishedTournaments(sorted);
      }
      if ('data' in upcomingResponse && upcomingResponse.data) {
        // For upcoming, sort ascending (soonest first on left)
        const sortByDateAsc = (a: Tournament, b: Tournament) => {
          const dateA = new Date(a.gameStartDateTime).getTime();
          const dateB = new Date(b.gameStartDateTime).getTime();
          return dateA - dateB;
        };
        const sorted = (upcomingResponse.data.listGames.items.filter(Boolean) as Tournament[]).sort(
          sortByDateAsc
        );
        setUpcomingTournaments(sorted);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const formatTimestamp = (date: Date | null) => {
    if (!date) return '-';
    return format(date, 'HH:mm:ss');
  };

  // Calculate totals for KPI cards
  const totalPrizepool = finishedTournaments.reduce(
    (sum, t) => sum + (t.prizepoolPaid || t.prizepoolCalculated || 0),
    0
  );

  if (loading) {
    return (
      <>
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tournament overview and live updates
          </p>
        </div>

        {/* Loading State */}
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading tournaments…</p>
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tournament overview and live updates
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              AEST: {formatTimestamp(lastUpdated)}
            </span>
          )}
          <Button onClick={fetchTournaments} variant="secondary" size="sm">
            <ArrowPathIcon className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4 mb-8">
        <KpiCard
          title="Running"
          value={runningTournaments.length}
          icon={<PlayIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Finished (7d)"
          value={finishedTournaments.length}
          icon={<CheckCircleIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Upcoming"
          value={upcomingTournaments.length}
          icon={<ClockIcon className="h-5 w-5" />}
        />
        <KpiCard
          title="Total Prizepool"
          value={formatCurrency(totalPrizepool)}
          subtitle="Last 7 days"
          icon={<TrophyIcon className="h-5 w-5" />}
        />
      </div>

      {/* Running Tournaments Section */}
      <section className="mb-10">
        <SectionHeader
          title="Running Tournaments"
          count={runningTournaments.length}
          icon={<PlayIcon className="w-5 h-5" />}
        />
        {runningTournaments.length === 0 ? (
          <EmptyState message="No tournaments currently running" />
        ) : (
          <HorizontalScrollRow>
            {runningTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} variant="running" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>

      {/* Recently Finished Section */}
      <section className="mb-10">
        <SectionHeader
          title="Recently Finished"
          count={finishedTournaments.length}
          icon={<CheckCircleIcon className="w-5 h-5" />}
        />
        {finishedTournaments.length === 0 ? (
          <EmptyState message="No tournaments finished in the last 7 days" />
        ) : (
          <HorizontalScrollRow>
            {finishedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} variant="finished" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>

      {/* Upcoming Tournaments Section */}
      <section className="mb-10">
        <SectionHeader
          title="Upcoming Tournaments"
          count={upcomingTournaments.length}
          icon={<ClockIcon className="w-5 h-5" />}
        />
        {upcomingTournaments.length === 0 ? (
          <EmptyState message="No upcoming tournaments found" />
        ) : (
          <HorizontalScrollRow>
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} variant="upcoming" />
            ))}
          </HorizontalScrollRow>
        )}
      </section>
    </>
  );
};

export default HomePage;