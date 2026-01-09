// src/pages/venues/VenueGameDetails.tsx
// VERSION: 2.0.0 - BREAKING CHANGE: Now uses recurringGameId instead of gameTypeKey
//
// CHANGELOG:
// - v2.0.0: BREAKING - Changed URL param from gameTypeKey to recurringGameId
//           - Filters games by recurringGameId instead of venueGameTypeKey
//           - Fetches RecurringGame record to get the display name
//           - Handles legacy gameTypeKey param with redirect or fallback
//           - GraphQL now fetches recurringGameId and recurringGame
// - v1.2.0: Added explicit filter to exclude series games (isSeries=true)
// - v1.1.0: Added Tournament ID column to game history table

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Grid, Text } from '@tremor/react';
import {
  ArrowLeftIcon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
  BanknotesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';
import { Dialog, Transition } from '@headlessui/react';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';
import { useEntity } from '../../contexts/EntityContext';
import { getClient } from '../../utils/apiClient';
import { MetricCard } from '../../components/ui/MetricCard';
import { TimeRangeToggle } from '../../components/ui/TimeRangeToggle';

// ---- Time range utilities ----

export type TimeRangeKey = 'ALL' | '12M' | '6M' | '3M' | '1M';

function getTimeRangeBounds(range: TimeRangeKey): { from: string | null; to: string | null } {
  const to = new Date();
  if (range === 'ALL') return { from: null, to: to.toISOString() };

  const months =
    range === '12M' ? 12 :
    range === '6M'  ? 6  :
    range === '3M'  ? 3  : 1;

  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ---- Enums ----

const GAME_STATUS_OPTIONS = [
  'INITIATING', 'SCHEDULED', 'REGISTERING', 'RUNNING', 
  'CANCELLED', 'FINISHED', 'NOT_IN_USE', 'NOT_PUBLISHED', 
  'CLOCK_STOPPED', 'UNKNOWN'
];

const TOURNAMENT_TYPE_OPTIONS = ['FREEZEOUT', 'REBUY', 'SATELLITE', 'DEEPSTACK'];

// ---- GraphQL Queries ----

const getVenueQuery = /* GraphQL */ `
  query GetVenue($id: ID!) {
    getVenue(id: $id) {
      id
      name
      entityId
    }
  }
`;

// NEW: Query to fetch RecurringGame details
const getRecurringGameQuery = /* GraphQL */ `
  query GetRecurringGame($id: ID!) {
    getRecurringGame(id: $id) {
      id
      name
      venueId
      entityId
      dayOfWeek
      gameType
      gameVariant
      tournamentType
      typicalBuyIn
      typicalGuarantee
      startTime
      rake
      venueFee
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
    }
  }
`;

// UPDATED: Query now includes recurringGameId filter and recurringGame object
const listGameFinancialSnapshotsWithGame = /* GraphQL */ `
  query ListGameFinancialSnapshotsWithGame(
    $filter: ModelGameFinancialSnapshotFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listGameFinancialSnapshots(filter: $filter, limit: $limit, nextToken: $nextToken) {
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
        prizepoolPaidDelta
        prizepoolJackpotContributions
        prizepoolAccumulatorTicketPayoutEstimate
        prizepoolAccumulatorTicketPayoutActual
        game {
          id
          name
          gameStatus
          isRegular
          isSeries
          venueScheduleKey
          venueGameTypeKey
          buyIn
          gameType
          gameVariant
          tournamentId
          recurringGameId
          recurringGame {
            id
            name
            dayOfWeek
          }
        }
      }
      nextToken
    }
  }
`;

const getGameQuery = /* GraphQL */ `
  query GetGame($id: ID!) {
    getGame(id: $id) {
      id
      name
      gameType
      gameVariant
      gameStatus
      gameStartDateTime
      gameEndDateTime
      registrationStatus
      totalDuration
      gameFrequency
      buyIn
      rake
      venueFee
      startingStack
      hasGuarantee
      guaranteeAmount
      prizepoolPaid
      prizepoolCalculated
      totalUniquePlayers
      totalRebuys
      totalAddons
      totalInitialEntries
      totalEntries
      totalBuyInsCollected
      rakeRevenue
      prizepoolPlayerContributions
      prizepoolAddedValue
      prizepoolSurplus
      guaranteeOverlayCost
      gameProfit
      playersRemaining
      totalChipsInPlay
      averagePlayerStack
      tournamentType
      isRegular
      isSatellite
      gameTags
      dealerDealt
      isSeries
      seriesName
      isMainEvent
      eventNumber
      dayNumber
      flightLetter
      finalDay
      parentGameId
      consolidationType
      consolidationKey
      isPartialData
      missingFlightCount
      expectedTotalEntries
      gameDayOfWeek
      buyInBucket
      venueScheduleKey
      venueGameTypeKey
      entityQueryKey
      entityGameTypeKey
      sourceUrl
      tournamentId
      wasEdited
      lastEditedAt
      lastEditedBy
      venueAssignmentStatus
      requiresVenueAssignment
      suggestedVenueName
      venueAssignmentConfidence
      seriesAssignmentStatus
      seriesAssignmentConfidence
      suggestedSeriesName
      venueId
      tournamentSeriesId
      entityId
      recurringGameId
      createdAt
      updatedAt
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
      numberOfAccumulatorTicketsPaid
    }
  }
`;

const updateGameMutation = /* GraphQL */ `
  mutation UpdateGame($input: UpdateGameInput!) {
    updateGame(input: $input) {
      id
      name
      gameType
      gameVariant
      gameStatus
      gameStartDateTime
      gameEndDateTime
      registrationStatus
      totalDuration
      gameFrequency
      buyIn
      rake
      venueFee
      startingStack
      hasGuarantee
      guaranteeAmount
      prizepoolPaid
      prizepoolCalculated
      totalUniquePlayers
      totalRebuys
      totalAddons
      totalInitialEntries
      totalEntries
      totalBuyInsCollected
      rakeRevenue
      prizepoolPlayerContributions
      prizepoolAddedValue
      prizepoolSurplus
      guaranteeOverlayCost
      gameProfit
      playersRemaining
      tournamentType
      isRegular
      isSatellite
      gameTags
      dealerDealt
      isSeries
      seriesName
      isMainEvent
      eventNumber
      dayNumber
      flightLetter
      finalDay
      consolidationType
      consolidationKey
      isPartialData
      missingFlightCount
      expectedTotalEntries
      venueScheduleKey
      venueGameTypeKey
      wasEdited
      lastEditedAt
      lastEditedBy
      updatedAt
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
      numberOfAccumulatorTicketsPaid
    }
  }
`;

// ---- Types ----

interface GameFinancialSnapshotWithGame {
  id: string;
  entityId?: string | null;
  venueId?: string | null;
  gameId?: string | null;
  gameStartDateTime?: string | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolTotal?: number | null;
  totalRevenue?: number | null;
  totalCost?: number | null;
  netProfit?: number | null;
  profitMargin?: number | null;
  gameType?: string | null;
  isSeries?: boolean | null;
  prizepoolPaidDelta?: number | null;
  prizepoolJackpotContributions?: number | null;
  prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  prizepoolAccumulatorTicketPayoutActual?: number | null;
  game?: {
    id: string;
    name?: string | null;
    gameStatus?: string | null;
    isRegular?: boolean | null;
    isSeries?: boolean | null;
    venueScheduleKey?: string | null;
    venueGameTypeKey?: string | null;
    buyIn?: number | null;
    gameType?: string | null;
    gameVariant?: string | null;
    tournamentId?: string | null;
    recurringGameId?: string | null;
    recurringGame?: {
      id: string;
      name?: string | null;
      dayOfWeek?: string | null;
    } | null;
  } | null;
}

interface VenueInfo {
  id: string;
  name: string;
  entityId?: string | null;
}

// NEW: RecurringGame type
interface RecurringGameInfo {
  id: string;
  name: string;
  venueId?: string | null;
  entityId?: string | null;
  dayOfWeek?: string | null;
  gameType?: string | null;
  gameVariant?: string | null;
  tournamentType?: string | null;
  typicalBuyIn?: number | null;
  typicalGuarantee?: number | null;
  startTime?: string | null;
  rake?: number | null;
  venueFee?: number | null;
  hasJackpotContributions?: boolean | null;
  jackpotContributionAmount?: number | null;
  hasAccumulatorTickets?: boolean | null;
  accumulatorTicketValue?: number | null;
}

interface GameRowData {
  id: string;
  gameId: string;
  date: string;
  name: string;
  buyIn: number;
  registrations: number;
  entries: number;
  prizepool: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number | null;
  tournamentId: string | null;
}

interface SummaryStats {
  totalGames: number;
  totalRegistrations: number;
  totalEntries: number;
  totalPrizepool: number;
  totalProfit: number;
  avgProfit: number;
  avgEntries: number;
}

interface GameDetails {
  id: string;
  name: string;
  gameType: string;
  gameVariant: string;
  gameStatus: string;
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  registrationStatus?: string | null;
  totalDuration?: number | null;
  gameFrequency?: string | null;
  buyIn?: number | null;
  rake?: number | null;
  venueFee?: number | null;
  startingStack?: number | null;
  hasGuarantee?: boolean | null;
  guaranteeAmount?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  totalUniquePlayers?: number | null;
  totalRebuys?: number | null;
  totalAddons?: number | null;
  totalInitialEntries?: number | null;
  totalEntries?: number | null;
  totalBuyInsCollected?: number | null;
  rakeRevenue?: number | null;
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  prizepoolSurplus?: number | null;
  guaranteeOverlayCost?: number | null;
  gameProfit?: number | null;
  playersRemaining?: number | null;
  totalChipsInPlay?: number | null;
  averagePlayerStack?: number | null;
  tournamentType?: string | null;
  isRegular?: boolean | null;
  isSatellite?: boolean | null;
  gameTags?: string[] | null;
  dealerDealt?: boolean | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  eventNumber?: number | null;
  dayNumber?: number | null;
  flightLetter?: string | null;
  finalDay?: boolean | null;
  parentGameId?: string | null;
  consolidationType?: string | null;
  consolidationKey?: string | null;
  isPartialData?: boolean | null;
  missingFlightCount?: number | null;
  expectedTotalEntries?: number | null;
  gameDayOfWeek?: string | null;
  buyInBucket?: string | null;
  venueScheduleKey?: string | null;
  venueGameTypeKey?: string | null;
  entityQueryKey?: string | null;
  entityGameTypeKey?: string | null;
  sourceUrl?: string | null;
  tournamentId?: string | null;
  wasEdited?: boolean | null;
  lastEditedAt?: string | null;
  lastEditedBy?: string | null;
  venueAssignmentStatus?: string | null;
  requiresVenueAssignment?: boolean | null;
  suggestedVenueName?: string | null;
  venueAssignmentConfidence?: number | null;
  seriesAssignmentStatus?: string | null;
  seriesAssignmentConfidence?: number | null;
  suggestedSeriesName?: string | null;
  venueId?: string | null;
  tournamentSeriesId?: string | null;
  entityId?: string | null;
  recurringGameId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  hasJackpotContributions?: boolean | null;
  jackpotContributionAmount?: number | null;
  hasAccumulatorTickets?: boolean | null;
  accumulatorTicketValue?: number | null;
  numberOfAccumulatorTicketsPaid?: number | null;
}

// ---- Helper functions ----

/**
 * UPDATED: Filter for valid game snapshots - now checks recurringGameId
 */
function isValidGameSnapshot(snapshot: GameFinancialSnapshotWithGame, recurringGameId: string): boolean {
  const game = snapshot.game;
  
  // Check for series games at both snapshot and game level
  const isSeries = snapshot.isSeries === true || game?.isSeries === true;
  
  // Exclude NOT_PUBLISHED games
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    console.log(`[VenueGameDetails] Snapshot ${snapshot.id} excluded: NOT_PUBLISHED`);
    return false;
  }
  
  // Exclude series games for all users
  if (isSeries) {
    console.log(`[VenueGameDetails] Snapshot ${snapshot.id} excluded: isSeries=true`);
    return false;
  }
  
  // PRIMARY CHECK: Match by recurringGameId
  const gameRecurringId = game?.recurringGameId;
  if (gameRecurringId !== recurringGameId) {
    return false;
  }
  
  const isValid = (
    !!game &&
    game.gameStatus === 'FINISHED'
  );
  
  return isValid;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });
  if (value < 0) {
    return `(-${formatted})`;
  }
  return formatted;
}

function buildGameRows(snapshots: GameFinancialSnapshotWithGame[]): GameRowData[] {
  return snapshots
    .filter((s) => s.gameStartDateTime && s.game)
    .sort((a, b) => {
      const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
      const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
      return dateB - dateA;
    })
    .map((snap) => ({
      id: snap.id,
      gameId: snap.gameId ?? snap.game?.id ?? '',
      date: snap.gameStartDateTime!,
      name: snap.game?.name ?? 'Unknown',
      buyIn: snap.game?.buyIn ?? 0,
      registrations: snap.totalUniquePlayers ?? 0,
      entries: snap.totalEntries ?? 0,
      prizepool: snap.prizepoolTotal ?? 0,
      revenue: snap.totalRevenue ?? 0,
      cost: snap.totalCost ?? 0,
      profit: snap.netProfit ?? 0,
      profitMargin: snap.profitMargin ?? null,
      tournamentId: snap.game?.tournamentId ?? null,
    }));
}

function buildSummaryStats(snapshots: GameFinancialSnapshotWithGame[]): SummaryStats {
  const totalGames = snapshots.length;
  const totalRegistrations = snapshots.reduce((sum, s) => sum + (s.totalUniquePlayers ?? 0), 0);
  const totalEntries = snapshots.reduce((sum, s) => sum + (s.totalEntries ?? 0), 0);
  const totalPrizepool = snapshots.reduce((sum, s) => sum + (s.prizepoolTotal ?? 0), 0);
  const totalProfit = snapshots.reduce((sum, s) => sum + (s.netProfit ?? 0), 0);

  return {
    totalGames,
    totalRegistrations,
    totalEntries,
    totalPrizepool,
    totalProfit,
    avgProfit: totalGames > 0 ? totalProfit / totalGames : 0,
    avgEntries: totalGames > 0 ? totalEntries / totalGames : 0,
  };
}

// ---- Game Edit Modal Component ----

interface GameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string | null;
  onSaveSuccess: () => void;
}

const GameEditModal: React.FC<GameEditModalProps> = ({ isOpen, onClose, gameId, onSaveSuccess }) => {
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null);
  const [formData, setFormData] = useState<Partial<GameDetails>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !gameId) {
      setGameDetails(null);
      setFormData({});
      return;
    }

    const fetchGame = async () => {
      setLoading(true);
      setError(null);
      try {
        const client = getClient();
        const res = await client.graphql({
          query: getGameQuery,
          variables: { id: gameId },
        }) as any;

        const game = res?.data?.getGame;
        if (game) {
          setGameDetails(game);
          setFormData({
            gameStatus: game.gameStatus,
            buyIn: game.buyIn,
            rake: game.rake,
            venueFee: game.venueFee,
            hasGuarantee: game.hasGuarantee,
            guaranteeAmount: game.guaranteeAmount,
            prizepoolPaid: game.prizepoolPaid,
            totalEntries: game.totalEntries,
            totalUniquePlayers: game.totalUniquePlayers,
            totalRebuys: game.totalRebuys,
            totalAddons: game.totalAddons,
            tournamentType: game.tournamentType,
            gameType: game.gameType,
            gameVariant: game.gameVariant,
            gameFrequency: game.gameFrequency,
            registrationStatus: game.registrationStatus,
            hasJackpotContributions: game.hasJackpotContributions,
            jackpotContributionAmount: game.jackpotContributionAmount,
            hasAccumulatorTickets: game.hasAccumulatorTickets,
            accumulatorTicketValue: game.accumulatorTicketValue,
            numberOfAccumulatorTicketsPaid: game.numberOfAccumulatorTicketsPaid,
          });
        } else {
          setError('Game not found');
        }
      } catch (err: any) {
        console.error('Error fetching game:', err);
        setError(err?.message ?? 'Failed to load game');
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [isOpen, gameId]);

  const handleSave = async () => {
    if (!gameId || !gameDetails) return;

    setSaving(true);
    setError(null);

    try {
      const client = getClient();
      
      const updateInput: any = {
        id: gameId,
        wasEdited: true,
        lastEditedAt: new Date().toISOString(),
        ...formData,
      };

      await client.graphql({
        query: updateGameMutation,
        variables: { input: updateInput },
      });

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving game:', err);
      setError(err?.message ?? 'Failed to save game');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof GameDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                    Edit Game
                  </Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading game details...</div>
                ) : error ? (
                  <div className="py-8 text-center text-red-600">{error}</div>
                ) : gameDetails ? (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <Text className="text-xs text-gray-500">Game</Text>
                      <Text className="font-medium">{gameDetails.name}</Text>
                      <Text className="text-xs text-gray-400 mt-1">
                        {gameDetails.gameStartDateTime && 
                          format(parseISO(gameDetails.gameStartDateTime), 'dd MMM yyyy HH:mm')}
                      </Text>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                        <select
                          value={formData.gameStatus || ''}
                          onChange={(e) => handleFieldChange('gameStatus', e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                          {GAME_STATUS_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tournament Type</label>
                        <select
                          value={formData.tournamentType || ''}
                          onChange={(e) => handleFieldChange('tournamentType', e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                          <option value="">None</option>
                          {TOURNAMENT_TYPE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Buy-in ($)</label>
                        <input
                          type="number"
                          value={formData.buyIn ?? ''}
                          onChange={(e) => handleFieldChange('buyIn', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Rake ($)</label>
                        <input
                          type="number"
                          value={formData.rake ?? ''}
                          onChange={(e) => handleFieldChange('rake', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Entries</label>
                        <input
                          type="number"
                          value={formData.totalEntries ?? ''}
                          onChange={(e) => handleFieldChange('totalEntries', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Prizepool Paid ($)</label>
                        <input
                          type="number"
                          value={formData.prizepoolPaid ?? ''}
                          onChange={(e) => handleFieldChange('prizepoolPaid', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div className="col-span-2 flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.hasGuarantee ?? false}
                            onChange={(e) => handleFieldChange('hasGuarantee', e.target.checked)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Has Guarantee
                        </label>
                        {formData.hasGuarantee && (
                          <div className="flex-1">
                            <input
                              type="number"
                              placeholder="Guarantee Amount"
                              value={formData.guaranteeAmount ?? ''}
                              onChange={(e) => handleFieldChange('guaranteeAmount', e.target.value ? parseFloat(e.target.value) : null)}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {error && (
                      <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// ---- Main Component ----

export const VenueGameDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedEntities, entities, loading: entityLoading } = useEntity();

  // UPDATED: Now uses recurringGameId instead of gameTypeKey
  const venueId = searchParams.get('venueId');
  const recurringGameId = searchParams.get('recurringGameId');
  // LEGACY: Keep support for old gameTypeKey param (for bookmarks/links)
  const legacyGameTypeKey = searchParams.get('gameTypeKey');
  
  const entityId: string | undefined = selectedEntities[0]?.id;

  // State
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [recurringGame, setRecurringGame] = useState<RecurringGameInfo | null>(null);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [gameName, setGameName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const showEntitySelector = entities && entities.length > 1;

  // LEGACY: If gameTypeKey is provided but not recurringGameId, show helpful message
  const isLegacyParam = !recurringGameId && legacyGameTypeKey;

  // Fetch data
  const fetchData = async () => {
    if (!venueId) {
      setError('No venue ID provided');
      setLoading(false);
      return;
    }
    
    if (!recurringGameId) {
      if (isLegacyParam) {
        setError(`This page now uses recurringGameId instead of gameTypeKey. The old URL format is no longer supported. Please navigate from the Venue Details page.`);
      } else {
        setError('No recurring game ID provided');
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();

      // 1) Fetch venue details
      const venueRes = await client.graphql({
        query: getVenueQuery,
        variables: { id: venueId },
      }) as any;

      const venueData = venueRes?.data?.getVenue;
      if (!venueData) {
        setError('Venue not found');
        setLoading(false);
        return;
      }
      setVenue(venueData);

      // 2) NEW: Fetch RecurringGame details
      const recurringRes = await client.graphql({
        query: getRecurringGameQuery,
        variables: { id: recurringGameId },
      }) as any;

      const recurringData = recurringRes?.data?.getRecurringGame;
      if (recurringData) {
        setRecurringGame(recurringData);
        setGameName(recurringData.name || recurringGameId);
      } else {
        console.warn(`[VenueGameDetails] RecurringGame not found: ${recurringGameId}`);
        setGameName(recurringGameId); // Fallback to ID
      }

      // 3) Fetch all snapshots for this venue
      const { from, to } = getTimeRangeBounds(timeRange);
      const allSnapshots: GameFinancialSnapshotWithGame[] = [];
      let nextToken: string | null | undefined = null;

      const baseFilter: any = {
        venueId: { eq: venueId },
      };

      if (entityId && venueData.entityId === entityId) {
        baseFilter.entityId = { eq: entityId };
      }

      if (from && to) {
        baseFilter.gameStartDateTime = { between: [from, to] };
      }

      do {
        const snapRes = await client.graphql({
          query: listGameFinancialSnapshotsWithGame,
          variables: {
            filter: baseFilter,
            limit: 500,
            nextToken,
          },
        }) as any;

        const page = snapRes?.data?.listGameFinancialSnapshots;
        const pageItems = page?.items?.filter((s: any) => s != null) ?? [];
        allSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
        nextToken = page?.nextToken ?? null;
      } while (nextToken);

      // 4) UPDATED: Filter by recurringGameId instead of venueGameTypeKey
      const validSnapshots = allSnapshots
        .filter(s => isValidGameSnapshot(s, recurringGameId));

      console.log(
        `[VenueGameDetails] Loaded ${allSnapshots.length} total snapshots, ${validSnapshots.length} for recurring game "${recurringGameId}"`
      );

      // Update game name from the most recent snapshot if RecurringGame wasn't found
      if (!recurringData && validSnapshots.length > 0) {
        const sortedByDate = [...validSnapshots].sort((a, b) => {
          const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
          const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
          return dateB - dateA;
        });
        const latestName = sortedByDate[0]?.game?.recurringGame?.name || sortedByDate[0]?.game?.name;
        if (latestName) {
          setGameName(latestName);
        }
      }

      setSnapshots(validSnapshots);
    } catch (err: any) {
      console.error('Error loading venue game details:', err);
      setError(err?.message ?? 'Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [venueId, recurringGameId, entityId, timeRange]);

  // Row click handlers
  const handleRowClick = (gameId: string) => {
    setSelectedGameId(gameId);
    setIsModalOpen(true);
  };

  const handleGameNameClick = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    navigate(`/games/details/${gameId}`);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedGameId(null);
  };

  const handleSaveSuccess = () => {
    fetchData();
  };

  const gameRows = useMemo(() => buildGameRows(snapshots), [snapshots]);
  const summaryStats = useMemo(() => buildSummaryStats(snapshots), [snapshots]);

  // Loading state
  if (entityLoading || loading) {
    return (
      <PageWrapper title="Game Details">
        <div className="py-20 text-center text-gray-400">
          Loading game details…
        </div>
      </PageWrapper>
    );
  }

  // Error state
  if (error || !venue) {
    return (
      <PageWrapper title="Game Details">
        <Card className="border-red-200 bg-red-50">
          <Text className="text-sm text-red-700">{error || 'Data not found'}</Text>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Go Back
          </button>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={gameName}>
      <button
        onClick={() => navigate(`/venues/details?venueId=${venueId}`)}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to {venue.name}
      </button>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showEntitySelector && (
          <div className="w-full sm:flex-1 sm:max-w-xs">
            <MultiEntitySelector />
          </div>
        )}
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Header Card */}
      <Card className="mb-6">
        <div>
          <Text className="text-xs uppercase tracking-wide text-gray-400">
            Recurring Game at {venue.name}
          </Text>
          <h2 className="text-xl font-bold text-gray-900 mt-1">
            {gameName}
          </h2>
          {recurringGame?.dayOfWeek && (
            <Text className="text-sm text-gray-500 mt-0.5">
              {recurringGame.dayOfWeek}
              {recurringGame.startTime && ` at ${recurringGame.startTime}`}
            </Text>
          )}
          <Text className="mt-1 text-sm text-gray-500">
            {summaryStats.totalGames} games in selected time range
          </Text>
        </div>
        
        {/* Show RecurringGame template info if available */}
        {recurringGame && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {recurringGame.typicalBuyIn && (
              <div>
                <Text className="text-xs text-gray-500">Typical Buy-in</Text>
                <Text className="font-medium">{formatCurrency(recurringGame.typicalBuyIn)}</Text>
              </div>
            )}
            {recurringGame.typicalGuarantee && (
              <div>
                <Text className="text-xs text-gray-500">Typical Guarantee</Text>
                <Text className="font-medium">{formatCurrency(recurringGame.typicalGuarantee)}</Text>
              </div>
            )}
            {recurringGame.gameVariant && (
              <div>
                <Text className="text-xs text-gray-500">Variant</Text>
                <Text className="font-medium">{recurringGame.gameVariant}</Text>
              </div>
            )}
            {recurringGame.tournamentType && (
              <div>
                <Text className="text-xs text-gray-500">Type</Text>
                <Text className="font-medium">{recurringGame.tournamentType}</Text>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Summary KPIs */}
      <Grid numItemsSm={2} numItemsLg={5} className="gap-4 mb-6">
        <MetricCard
          label="Total Games"
          value={summaryStats.totalGames.toLocaleString()}
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Registrations"
          value={summaryStats.totalRegistrations.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Entries"
          value={summaryStats.totalEntries.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
          secondary={`Avg ${summaryStats.avgEntries.toFixed(1)}/game`}
        />
        <MetricCard
          label="Total Prizepool"
          value={formatCurrency(summaryStats.totalPrizepool)}
          icon={<TrophyIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Profit"
          value={formatCurrency(summaryStats.totalProfit)}
          icon={<BanknotesIcon className="h-6 w-6" />}
          secondary={`Avg ${formatCurrency(summaryStats.avgProfit)}/game`}
        />
      </Grid>

      {/* Game History Table */}
      <Card>
        <Text className="mb-3 text-sm font-semibold">
          Game History (click name to view details, click row to edit)
        </Text>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Game</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy-in</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rego</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entries</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">PP</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rev</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {gameRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleRowClick(row.gameId)}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    {(() => {
                      try {
                        return format(parseISO(row.date), 'dd MMM yyyy');
                      } catch {
                        return '-';
                      }
                    })()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">
                    {row.tournamentId || '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      onClick={(e) => handleGameNameClick(e, row.gameId)}
                      className="font-medium text-indigo-600 hover:text-indigo-900 hover:underline text-left"
                      title={`View details for ${row.name}`}
                    >
                      {row.name.length > 40 ? row.name.substring(0, 40) + '...' : row.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(row.buyIn)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.registrations.toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.entries.toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(row.prizepool)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(row.revenue)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(row.cost)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`font-semibold ${row.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatCurrency(row.profit)}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.profitMargin !== null ? (
                      <span className={row.profitMargin >= 0 ? 'text-blue-600' : 'text-red-600'}>
                        {(row.profitMargin * 100).toFixed(1)}%
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {gameRows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={11}>
                    No data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Game Edit Modal */}
      <GameEditModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        gameId={selectedGameId}
        onSaveSuccess={handleSaveSuccess}
      />
    </PageWrapper>
  );
};

export default VenueGameDetails;