// src/pages/series/SeriesGameDetails.tsx
// VERSION: 2.0.0 - Series Game Details Page
//
// Shows detailed view of a specific event within a tournament series:
// - Single-day events: Direct game display with financials
// - Multi-day events (PARENT): Aggregated summary + table of CHILD flights/days
//   - Clicking a CHILD navigates to GameDetails for that specific flight

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  TrophyIcon,
  CalendarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChevronRightIcon,
  BanknotesIcon,
  TicketIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { getClient } from '@/utils/apiClient';
import { cx, formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

// ============================================
// GRAPHQL QUERIES
// ============================================

const getGameQuery = /* GraphQL */ `
  query GetGame($id: ID!) {
    getGame(id: $id) {
      id
      name
      gameStatus
      gameType
      gameVariant
      buyIn
      rake
      startingStack
      gameStartDateTime
      gameEndDateTime
      
      entityId
      venueId
      venue {
        id
        name
      }
      
      isRegular
      isSeries
      tournamentSeriesId
      tournamentSeries {
        id
        name
        year
      }
      
      consolidationType
      parentGameId
      dayNumber
      flightLetter
      finalDay
      isMainEvent
      
      totalEntries
      totalUniquePlayers
      totalRebuys
      totalAddons
      
      hasGuarantee
      guaranteeAmount
      prizepoolPaid
    }
  }
`;

const getGameFinancialSnapshotQuery = /* GraphQL */ `
  query GetGameFinancialSnapshot($gameId: ID!) {
    listGameFinancialSnapshots(
      filter: { gameId: { eq: $gameId } }
      limit: 1
    ) {
      items {
        id
        entityId
        venueId
        gameId
        gameStartDateTime
        
        totalEntries
        totalUniquePlayers
        
        prizepoolTotal
        
        totalRevenue
        totalCost
        netProfit
        profitMargin
        
        gameType
        isSeries
        isSeriesParent
        parentGameId
        tournamentSeriesId
        seriesName
        
        createdAt
        updatedAt
      }
    }
  }
`;

// Query child GAMES using GSI (parentGameId)
const listChildGamesQuery = /* GraphQL */ `
  query GamesByParentGameId($parentGameId: ID!, $limit: Int) {
    gamesByParentGameIdAndGameStartDateTime(
      parentGameId: $parentGameId
      limit: $limit
      sortDirection: ASC
    ) {
      items {
        id
        name
        gameStatus
        gameStartDateTime
        gameEndDateTime
        
        buyIn
        rake
        totalEntries
        totalUniquePlayers
        totalRebuys
        totalAddons
        
        dayNumber
        flightLetter
        finalDay
        
        prizepoolPaid
        gameProfit
        
        consolidationType
        parentGameId
      }
      nextToken
    }
  }
`;

// Fallback: query all games in a series using GSI
const listSeriesGamesQuery = /* GraphQL */ `
  query GamesByTournamentSeriesId($tournamentSeriesId: ID!, $limit: Int) {
    gamesByTournamentSeriesIdAndGameStartDateTime(
      tournamentSeriesId: $tournamentSeriesId
      limit: $limit
      sortDirection: ASC
    ) {
      items {
        id
        name
        gameStatus
        gameStartDateTime
        gameEndDateTime
        
        buyIn
        rake
        totalEntries
        totalUniquePlayers
        totalRebuys
        totalAddons
        
        dayNumber
        flightLetter
        finalDay
        
        prizepoolPaid
        gameProfit
        
        consolidationType
        parentGameId
      }
      nextToken
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface Game {
  id: string;
  name: string;
  gameStatus: string;
  gameType: string;
  gameVariant: string;
  buyIn: number;
  rake: number;
  startingStack: number;
  gameStartDateTime: string;
  gameEndDateTime: string;
  
  entityId: string;
  venueId: string;
  venue?: {
    id: string;
    name: string;
  };
  
  isRegular: boolean;
  isSeries: boolean;
  tournamentSeriesId: string;
  tournamentSeries?: {
    id: string;
    name: string;
    year: number;
  };
  
  consolidationType: string;
  parentGameId: string | null;
  dayNumber: number | null;
  flightLetter: string | null;
  finalDay: boolean;
  isMainEvent: boolean;
  
  totalEntries: number;
  totalUniquePlayers: number;
  totalRebuys: number;
  totalAddons: number;
  
  hasGuarantee: boolean;
  guaranteeAmount: number;
  prizepoolPaid: number;
}

interface GameFinancialSnapshot {
  id: string;
  entityId: string;
  venueId: string;
  gameId: string;
  gameStartDateTime: string;
  
  totalEntries: number;
  totalUniquePlayers: number;
  
  prizepoolTotal: number;
  
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  
  gameType: string;
  isSeries: boolean;
  isSeriesParent: boolean;
  parentGameId: string | null;
  tournamentSeriesId: string;
  seriesName: string;
  
  createdAt: string;
  updatedAt: string;
}

interface ChildGame {
  id: string;
  name: string;
  gameStatus: string;
  gameStartDateTime: string;
  gameEndDateTime: string;
  
  buyIn: number;
  rake: number;
  totalEntries: number;
  totalUniquePlayers: number;
  totalRebuys: number;
  totalAddons: number;
  
  dayNumber: number | null;
  flightLetter: string | null;
  finalDay: boolean;
  
  prizepoolPaid: number;
  gameProfit: number;
  
  consolidationType: string;
  parentGameId: string;
}

interface FlightRowData {
  id: string;
  name: string;
  dayNumber: number | null;
  flightLetter: string | null;
  date: string;
  status: string;
  entries: number;
  uniquePlayers: number;
  prizepool: number;
  profit: number;
  isFinalDay: boolean;
}

// ============================================
// HELPERS
// ============================================

function formatProfit(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

function GameStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'FINISHED': 'bg-green-100 text-green-800 border-green-200',
    'IN_PROGRESS': 'bg-blue-100 text-blue-800 border-blue-200',
    'SCHEDULED': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'CANCELLED': 'bg-red-100 text-red-800 border-red-200',
    'POSTPONED': 'bg-orange-100 text-orange-800 border-orange-200',
  };
  
  return (
    <span className={cx(
      "px-2 py-0.5 text-xs font-medium rounded border",
      styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'
    )}>
      {status?.replace(/_/g, ' ') || 'Unknown'}
    </span>
  );
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  className 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon?: React.ReactNode; 
  className?: string; 
}) {
  return (
    <Card className={cx("p-4", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-50 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-purple-500">{icon}</div>}
      </div>
    </Card>
  );
}

// ============================================
// COMPONENT
// ============================================

export function SeriesGameDetails() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const gameId = searchParams.get('gameId');
  const seriesId = searchParams.get('seriesId');

  const [game, setGame] = useState<Game | null>(null);
  const [snapshot, setSnapshot] = useState<GameFinancialSnapshot | null>(null);
  const [childGames, setChildGames] = useState<ChildGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    if (!gameId) {
      setError('No game ID provided');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const client = getClient();

        // Fetch game details
        const gameRes = await client.graphql({
          query: getGameQuery,
          variables: { id: gameId }
        });

        const gameData = (gameRes as any).data?.getGame;
        if (!gameData) {
          setError('Game not found');
          return;
        }
        setGame(gameData);

        // Fetch financial snapshot
        const snapshotRes = await client.graphql({
          query: getGameFinancialSnapshotQuery,
          variables: { gameId }
        });
        const snapshotItems = (snapshotRes as any).data?.listGameFinancialSnapshots?.items || [];
        if (snapshotItems.length > 0) {
          setSnapshot(snapshotItems[0]);
        }

        // If this is a PARENT (multi-day), fetch child games
        if (gameData.consolidationType === 'PARENT') {
          console.log('[SeriesGameDetails] Fetching child games for PARENT:', gameId);
          
          try {
            const childRes = await client.graphql({
              query: listChildGamesQuery,
              variables: { parentGameId: gameId, limit: 100 }
            });
            console.log('[SeriesGameDetails] Child games response:', childRes);
            
            const childItems = (childRes as any).data?.gamesByParentGameIdAndGameStartDateTime?.items || [];
            console.log('[SeriesGameDetails] Found child games:', childItems.length);
            setChildGames(childItems);
          } catch (childErr) {
            console.error('[SeriesGameDetails] Error fetching child games:', childErr);
            // Try alternative: query all games in series and filter client-side
            if (gameData.tournamentSeriesId) {
              console.log('[SeriesGameDetails] Trying fallback - fetching all series games');
              try {
                const fallbackRes = await client.graphql({
                  query: listSeriesGamesQuery,
                  variables: { tournamentSeriesId: gameData.tournamentSeriesId, limit: 500 }
                });
                const allSeriesGames = (fallbackRes as any).data?.gamesByTournamentSeriesIdAndGameStartDateTime?.items || [];
                const children = allSeriesGames.filter((g: any) => g.parentGameId === gameId);
                console.log('[SeriesGameDetails] Fallback found children:', children.length);
                setChildGames(children);
              } catch (fallbackErr) {
                console.error('[SeriesGameDetails] Fallback also failed:', fallbackErr);
              }
            }
          }
        }

      } catch (err: any) {
        console.error('Error fetching game data:', err);
        setError(err.message || 'Failed to load game data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [gameId]);

  // Check if this is a multi-day (PARENT) event
  const isMultiDay = game?.consolidationType === 'PARENT';
  const flightCount = childGames.length;

  // Transform child games into table rows
  const flightRows: FlightRowData[] = useMemo(() => {
    return childGames
      .map(g => ({
        id: g.id,
        name: g.name,
        dayNumber: g.dayNumber,
        flightLetter: g.flightLetter,
        date: g.gameStartDateTime,
        status: g.gameStatus,
        entries: g.totalEntries || 0,
        uniquePlayers: g.totalUniquePlayers || 0,
        prizepool: g.prizepoolPaid || 0,
        profit: g.gameProfit || 0,
        isFinalDay: g.finalDay || false,
      }))
      .sort((a, b) => {
        // Sort by day number first, then by flight letter, then by date
        if (a.dayNumber && b.dayNumber && a.dayNumber !== b.dayNumber) {
          return a.dayNumber - b.dayNumber;
        }
        if (a.flightLetter && b.flightLetter) {
          return a.flightLetter.localeCompare(b.flightLetter);
        }
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [childGames]);

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const flightColumns: ColumnDef<FlightRowData>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Flight / Day',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div>
            <span className="font-medium">{row.original.name}</span>
            {row.original.isFinalDay && (
              <span className="ml-2 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                Final Day
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'dayNumber',
      header: 'Day',
      cell: ({ row }) => {
        const day = row.original.dayNumber;
        const flight = row.original.flightLetter;
        if (day && flight) return `Day ${day} - Flight ${flight}`;
        if (day) return `Day ${day}`;
        if (flight) return `Flight ${flight}`;
        return '-';
      },
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ getValue }) => {
        const date = getValue() as string;
        if (!date) return '-';
        try {
          return format(parseISO(date), 'EEE, MMM d, yyyy h:mm a');
        } catch {
          return '-';
        }
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <GameStatusBadge status={getValue() as string} />,
    },
    {
      accessorKey: 'entries',
      header: 'Entries',
      cell: ({ getValue }) => (getValue() as number).toLocaleString(),
    },
    {
      accessorKey: 'uniquePlayers',
      header: 'Players',
      cell: ({ getValue }) => (getValue() as number).toLocaleString(),
    },
    {
      accessorKey: 'prizepool',
      header: 'Prizepool',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: 'profit',
      header: 'Profit',
      cell: ({ row }) => {
        const profit = row.original.profit;
        return (
          <span className={profit < 0 ? 'text-red-600' : 'text-green-600'}>
            {formatProfit(profit)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/games/details/${row.original.id}`);
          }}
          className="text-purple-600 hover:text-purple-800"
        >
          View Details
          <ChevronRightIcon className="w-4 h-4 ml-1" />
        </Button>
      ),
    },
  ], [navigate]);

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  const handleFlightRowClick = (flight: FlightRowData) => {
    navigate(`/games/details/${flight.id}`);
  };

  const handleBackToSeries = () => {
    if (seriesId) {
      navigate(`/series/details?seriesId=${seriesId}`);
    } else {
      navigate('/series/dashboard');
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Loading event details...</p>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{error || 'Event not found'}</p>
          <Button variant="secondary" onClick={handleBackToSeries} className="mt-4">
            Back to Series
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button 
          onClick={() => navigate('/series/dashboard')} 
          className="hover:text-purple-600 transition-colors"
        >
          Series
        </button>
        <ChevronRightIcon className="w-4 h-4" />
        {game.tournamentSeries && (
          <>
            <button 
              onClick={handleBackToSeries}
              className="hover:text-purple-600 transition-colors"
            >
              {game.tournamentSeries.name} {game.tournamentSeries.year}
            </button>
            <ChevronRightIcon className="w-4 h-4" />
          </>
        )}
        <span className="text-gray-900 dark:text-gray-50 font-medium">{game.name}</span>
      </div>

      {/* Game Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" onClick={handleBackToSeries}>
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                {game.name}
              </h1>
              <GameStatusBadge status={game.gameStatus} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {game.isMainEvent && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <TrophyIcon className="w-4 h-4" />
                  Main Event
                </span>
              )}
              {isMultiDay && (
                <span className="flex items-center gap-1 text-purple-600">
                  <CalendarIcon className="w-4 h-4" />
                  Multi-Day Event ({flightCount} flights)
                </span>
              )}
              {game.venue?.name && (
                <span>{game.venue.name}</span>
              )}
              {game.gameStartDateTime && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-4 h-4" />
                  {format(parseISO(game.gameStartDateTime), 'MMMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Game Structure Info */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-gray-500">Buy-in</p>
            <p className="text-lg font-semibold">{formatCurrency(game.buyIn || 0)}</p>
          </div>
          {game.rake > 0 && (
            <div>
              <p className="text-xs text-gray-500">Rake</p>
              <p className="text-lg font-semibold">{formatCurrency(game.rake)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">Starting Stack</p>
            <p className="text-lg font-semibold">{game.startingStack?.toLocaleString() || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Game Type</p>
            <p className="text-lg font-semibold">{game.gameVariant || game.gameType || '-'}</p>
          </div>
          {game.hasGuarantee && game.guaranteeAmount > 0 && (
            <div>
              <p className="text-xs text-gray-500">Guarantee</p>
              <p className="text-lg font-semibold text-yellow-600">{formatCurrency(game.guaranteeAmount)}</p>
            </div>
          )}
          {game.totalRebuys > 0 && (
            <div>
              <p className="text-xs text-gray-500">Rebuys</p>
              <p className="text-lg font-semibold">{game.totalRebuys}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Financial Summary - From Snapshot (aggregated for PARENT) */}
      {snapshot ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="Total Entries"
              value={snapshot.totalEntries.toLocaleString()}
              icon={<TicketIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Unique Players"
              value={snapshot.totalUniquePlayers.toLocaleString()}
              icon={<UserGroupIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Prizepool"
              value={formatCurrency(snapshot.prizepoolTotal)}
              icon={<TrophyIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Revenue"
              value={formatCurrency(snapshot.totalRevenue)}
              icon={<BanknotesIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Cost"
              value={formatCurrency(snapshot.totalCost)}
              icon={<CurrencyDollarIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Net Profit"
              value={formatProfit(snapshot.netProfit)}
              subtitle={`Margin: ${snapshot.profitMargin?.toFixed(1) || 0}%`}
              icon={<CurrencyDollarIcon className="w-5 h-5" />}
              className={snapshot.netProfit < 0 ? 'border-red-200' : ''}
            />
          </div>

          {/* Profitability Summary */}
          <Card className="p-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Net Result</h3>
                <p className="text-xs text-gray-500 mt-1">Revenue - Cost = Profit</p>
              </div>
              <div className="flex items-center gap-4 text-lg font-semibold">
                <span className="text-green-600">{formatCurrency(snapshot.totalRevenue)}</span>
                <span className="text-gray-400">-</span>
                <span className="text-red-600">{formatCurrency(snapshot.totalCost)}</span>
                <span className="text-gray-400">=</span>
                <span className={snapshot.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatProfit(snapshot.netProfit)}
                </span>
              </div>
            </div>
          </Card>

          {/* Last Updated */}
          <div className="text-xs text-gray-400 text-right">
            Last updated: {snapshot.updatedAt ? format(parseISO(snapshot.updatedAt), 'MMM d, yyyy h:mm a') : 'Unknown'}
          </div>
        </>
      ) : (
        <Card className="p-8 text-center">
          <CurrencyDollarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No financial snapshot available for this event.</p>
        </Card>
      )}

      {/* Multi-Day Event: Flight/Day Breakdown */}
      {isMultiDay && flightRows.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-purple-500" />
              Flights & Days ({flightRows.length})
            </h3>
            <p className="text-xs text-gray-500">
              Click any row to view detailed game information
            </p>
          </div>
          <div className="-mx-4 sm:-mx-6">
            <DataTable 
              data={flightRows} 
              columns={flightColumns}
              onRowClick={handleFlightRowClick}
            />
          </div>
        </Card>
      )}

      {/* Single-Day Event: Direct link to GameDetails */}
      {!isMultiDay && game && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                View Full Game Details
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                See player entries, results, and more detailed information
              </p>
            </div>
            <Button 
              variant="primary" 
              onClick={() => navigate(`/games/details/${game.id}`)}
              className="flex items-center gap-2"
            >
              <PlayIcon className="w-4 h-4" />
              View Game Details
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}