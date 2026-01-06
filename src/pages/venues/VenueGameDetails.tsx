// src/pages/venues/VenueGameDetails.tsx
// VERSION: 1.1.0 - Added Tournament ID column
//
// CHANGELOG:
// - v1.1.0: Added Tournament ID column to game history table (between Date and Game)

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
  PencilSquareIcon,
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

const GAME_TYPE_OPTIONS = ['TOURNAMENT', 'CASH_GAME'];

const GAME_VARIANT_OPTIONS = ['NLHE', 'PLO', 'PLOM', 'PLO5', 'PLO6', 'PLMIXED'];

const GAME_FREQUENCY_OPTIONS = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'UNKNOWN'];

const REGISTRATION_STATUS_OPTIONS = ['SCHEDULED', 'OPEN', 'FINAL', 'CLOSED', 'N_A'];

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
        # New prizepool adjustment fields
        prizepoolPaidDelta
        prizepoolJackpotContributions
        prizepoolAccumulatorTicketPayoutEstimate
        prizepoolAccumulatorTicketPayoutActual
        game {
          id
          name
          gameStatus
          isRegular
          venueScheduleKey
          venueGameTypeKey
          buyIn
          gameType
          gameVariant
          tournamentId
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
      createdAt
      updatedAt
      # Jackpot contributions (inherited from RecurringGame)
      hasJackpotContributions
      jackpotContributionAmount
      # Accumulator tickets (inherited from RecurringGame)
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
      # Jackpot contributions (inherited from RecurringGame)
      hasJackpotContributions
      jackpotContributionAmount
      # Accumulator tickets (inherited from RecurringGame)
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
  // New prizepool adjustment fields
  prizepoolPaidDelta?: number | null;
  prizepoolJackpotContributions?: number | null;
  prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  prizepoolAccumulatorTicketPayoutActual?: number | null;
  game?: {
    id: string;
    name?: string | null;
    gameStatus?: string | null;
    isRegular?: boolean | null;
    venueScheduleKey?: string | null;
    venueGameTypeKey?: string | null;
    buyIn?: number | null;
    gameType?: string | null;
    gameVariant?: string | null;
    tournamentId?: string | null;
  } | null;
}

interface VenueInfo {
  id: string;
  name: string;
  entityId?: string | null;
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
  tournamentId?: number | null;
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
  createdAt?: string | null;
  updatedAt?: string | null;
  // Jackpot contributions (inherited from RecurringGame)
  hasJackpotContributions?: boolean | null;
  jackpotContributionAmount?: number | null;
  // Accumulator tickets (inherited from RecurringGame)
  hasAccumulatorTickets?: boolean | null;
  accumulatorTicketValue?: number | null;
  numberOfAccumulatorTicketsPaid?: number | null;
}

// ---- Helpers ----

function isValidGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  // Debug logging to identify filtering issues
  const checks = {
    hasGame: !!game,
    gameStatus: game?.gameStatus,
    isFinished: game?.gameStatus === 'FINISHED',
    isRegular: game?.isRegular,
    venueScheduleKey: game?.venueScheduleKey,
    venueGameTypeKey: game?.venueGameTypeKey,
  };
  
  // Explicitly exclude NOT_PUBLISHED games
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    console.log(`[VenueGameDetails] Snapshot ${snapshot.id} excluded: NOT_PUBLISHED`);
    return false;
  }
  
  const isValid = (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    game.isRegular === true &&
    !!game.venueScheduleKey &&
    !!game.venueGameTypeKey
  );
  
  if (!isValid) {
    console.log(`[VenueGameDetails] Snapshot ${snapshot.id} filtered out:`, checks);
  }
  
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
      gameId: snap.gameId ?? snap.id,
      date: snap.gameStartDateTime!,
      name: snap.game?.name ?? 'Unknown Game',
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
  const avgProfit = totalGames > 0 ? totalProfit / totalGames : 0;
  const avgEntries = totalGames > 0 ? totalEntries / totalGames : 0;
  return { totalGames, totalRegistrations, totalEntries, totalPrizepool, totalProfit, avgProfit, avgEntries };
}

// ---- Modal Component ----

interface GameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string | null;
  onSaveSuccess: () => void;
}

const GameEditModal: React.FC<GameEditModalProps> = ({ isOpen, onClose, gameId, onSaveSuccess }) => {
  const [game, setGame] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for editable fields
  const [formData, setFormData] = useState({
    name: '',
    gameStatus: '',
    gameType: '',
    gameVariant: '',
    gameFrequency: '',
    registrationStatus: '',
    buyIn: '',
    rake: '',
    venueFee: '',
    startingStack: '',
    hasGuarantee: false,
    guaranteeAmount: '',
    prizepoolPaid: '',
    prizepoolCalculated: '',
    totalUniquePlayers: '',
    totalInitialEntries: '',
    totalEntries: '',
    totalRebuys: '',
    totalAddons: '',
    tournamentType: '',
    isRegular: false,
    isSatellite: false,
    dealerDealt: false,
    isSeries: false,
    seriesName: '',
    isMainEvent: false,
    eventNumber: '',
    dayNumber: '',
    flightLetter: '',
    finalDay: false,
    // Jackpot contributions
    hasJackpotContributions: false,
    jackpotContributionAmount: '',
    // Accumulator tickets
    hasAccumulatorTickets: false,
    accumulatorTicketValue: '',
    numberOfAccumulatorTicketsPaid: '',
  });

  // Fetch game details when modal opens
  useEffect(() => {
    if (isOpen && gameId) {
      fetchGameDetails(gameId);
    }
  }, [isOpen, gameId]);

  const fetchGameDetails = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const client = getClient();
      const response = await client.graphql({
        query: getGameQuery,
        variables: { id },
      }) as any;

      const gameData = response?.data?.getGame;
      if (gameData) {
        setGame(gameData);
        // Initialize form with game data
        setFormData({
          name: gameData.name || '',
          gameStatus: gameData.gameStatus || '',
          gameType: gameData.gameType || '',
          gameVariant: gameData.gameVariant || '',
          gameFrequency: gameData.gameFrequency || '',
          registrationStatus: gameData.registrationStatus || '',
          buyIn: gameData.buyIn?.toString() || '',
          rake: gameData.rake?.toString() || '',
          venueFee: gameData.venueFee?.toString() || '',
          startingStack: gameData.startingStack?.toString() || '',
          hasGuarantee: gameData.hasGuarantee || false,
          guaranteeAmount: gameData.guaranteeAmount?.toString() || '',
          prizepoolPaid: gameData.prizepoolPaid?.toString() || '',
          prizepoolCalculated: gameData.prizepoolCalculated?.toString() || '',
          totalUniquePlayers: gameData.totalUniquePlayers?.toString() || '',
          totalInitialEntries: gameData.totalInitialEntries?.toString() || '',
          totalEntries: gameData.totalEntries?.toString() || '',
          totalRebuys: gameData.totalRebuys?.toString() || '',
          totalAddons: gameData.totalAddons?.toString() || '',
          tournamentType: gameData.tournamentType || '',
          isRegular: gameData.isRegular || false,
          isSatellite: gameData.isSatellite || false,
          dealerDealt: gameData.dealerDealt || false,
          isSeries: gameData.isSeries || false,
          seriesName: gameData.seriesName || '',
          isMainEvent: gameData.isMainEvent || false,
          eventNumber: gameData.eventNumber?.toString() || '',
          dayNumber: gameData.dayNumber?.toString() || '',
          flightLetter: gameData.flightLetter || '',
          finalDay: gameData.finalDay || false,
          // Jackpot contributions
          hasJackpotContributions: gameData.hasJackpotContributions || false,
          jackpotContributionAmount: gameData.jackpotContributionAmount?.toString() || '',
          // Accumulator tickets
          hasAccumulatorTickets: gameData.hasAccumulatorTickets || false,
          accumulatorTicketValue: gameData.accumulatorTicketValue?.toString() || '',
          numberOfAccumulatorTicketsPaid: gameData.numberOfAccumulatorTicketsPaid?.toString() || '',
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

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!game) return;

    setSaving(true);
    setError(null);

    try {
      const client = getClient();

      // Build update input with only changed fields
      const input: any = {
        id: game.id,
        name: formData.name,
        gameStatus: formData.gameStatus || null,
        gameType: formData.gameType || null,
        gameVariant: formData.gameVariant || null,
        gameFrequency: formData.gameFrequency || null,
        registrationStatus: formData.registrationStatus || null,
        buyIn: formData.buyIn ? parseFloat(formData.buyIn) : null,
        rake: formData.rake ? parseFloat(formData.rake) : null,
        venueFee: formData.venueFee ? parseFloat(formData.venueFee) : null,
        startingStack: formData.startingStack ? parseInt(formData.startingStack) : null,
        hasGuarantee: formData.hasGuarantee,
        guaranteeAmount: formData.guaranteeAmount ? parseFloat(formData.guaranteeAmount) : null,
        prizepoolPaid: formData.prizepoolPaid ? parseFloat(formData.prizepoolPaid) : null,
        prizepoolCalculated: formData.prizepoolCalculated ? parseFloat(formData.prizepoolCalculated) : null,
        totalUniquePlayers: formData.totalUniquePlayers ? parseInt(formData.totalUniquePlayers) : null,
        totalInitialEntries: formData.totalInitialEntries ? parseInt(formData.totalInitialEntries) : null,
        totalEntries: formData.totalEntries ? parseInt(formData.totalEntries) : null,
        totalRebuys: formData.totalRebuys ? parseInt(formData.totalRebuys) : null,
        totalAddons: formData.totalAddons ? parseInt(formData.totalAddons) : null,
        tournamentType: formData.tournamentType || null,
        isRegular: formData.isRegular,
        isSatellite: formData.isSatellite,
        dealerDealt: formData.dealerDealt,
        isSeries: formData.isSeries,
        seriesName: formData.seriesName || null,
        isMainEvent: formData.isMainEvent,
        eventNumber: formData.eventNumber ? parseInt(formData.eventNumber) : null,
        dayNumber: formData.dayNumber ? parseInt(formData.dayNumber) : null,
        flightLetter: formData.flightLetter || null,
        finalDay: formData.finalDay,
        // Jackpot contributions
        hasJackpotContributions: formData.hasJackpotContributions,
        jackpotContributionAmount: formData.jackpotContributionAmount ? parseFloat(formData.jackpotContributionAmount) : null,
        // Accumulator tickets
        hasAccumulatorTickets: formData.hasAccumulatorTickets,
        accumulatorTicketValue: formData.accumulatorTicketValue ? parseFloat(formData.accumulatorTicketValue) : null,
        numberOfAccumulatorTicketsPaid: formData.numberOfAccumulatorTicketsPaid ? parseInt(formData.numberOfAccumulatorTicketsPaid) : null,
        // Mark as edited
        wasEdited: true,
        lastEditedAt: new Date().toISOString(),
      };

      await client.graphql({
        query: updateGameMutation,
        variables: { input },
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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900 flex items-center">
                    <PencilSquareIcon className="h-5 w-5 mr-2 text-indigo-600" />
                    Edit Game
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-gray-400">Loading game details…</div>
                ) : error ? (
                  <div className="py-12 text-center text-red-500">{error}</div>
                ) : game ? (
                  <div className="space-y-6">
                    {/* Read-only Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Game ID:</span>
                          <div className="font-mono text-xs">{game.id.slice(0, 12)}...</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Tournament ID:</span>
                          <div>{game.tournamentId || '-'}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Start Time:</span>
                          <div>
                            {game.gameStartDateTime
                              ? format(parseISO(game.gameStartDateTime), 'dd MMM yyyy HH:mm')
                              : '-'}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Source:</span>
                          <div>
                            {game.sourceUrl ? (
                              <a
                                href={game.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline"
                              >
                                View Source
                              </a>
                            ) : (
                              '-'
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Basic Info */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Basic Information</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Status</label>
                          <select
                            value={formData.gameStatus}
                            onChange={(e) => handleInputChange('gameStatus', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {GAME_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Game Type</label>
                          <select
                            value={formData.gameType}
                            onChange={(e) => handleInputChange('gameType', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {GAME_TYPE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Variant</label>
                          <select
                            value={formData.gameVariant}
                            onChange={(e) => handleInputChange('gameVariant', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {GAME_VARIANT_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                          <select
                            value={formData.gameFrequency}
                            onChange={(e) => handleInputChange('gameFrequency', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {GAME_FREQUENCY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Registration Status</label>
                          <select
                            value={formData.registrationStatus}
                            onChange={(e) => handleInputChange('registrationStatus', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {REGISTRATION_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Tournament Type</label>
                          <select
                            value={formData.tournamentType}
                            onChange={(e) => handleInputChange('tournamentType', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          >
                            <option value="">Select...</option>
                            {TOURNAMENT_TYPE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Financial Info */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Financial Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Buy-in ($)</label>
                          <input
                            type="number"
                            value={formData.buyIn}
                            onChange={(e) => handleInputChange('buyIn', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Rake ($)</label>
                          <input
                            type="number"
                            value={formData.rake}
                            onChange={(e) => handleInputChange('rake', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Venue Fee ($)</label>
                          <input
                            type="number"
                            value={formData.venueFee}
                            onChange={(e) => handleInputChange('venueFee', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Starting Stack</label>
                          <input
                            type="number"
                            value={formData.startingStack}
                            onChange={(e) => handleInputChange('startingStack', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Prizepool Paid ($)</label>
                          <input
                            type="number"
                            value={formData.prizepoolPaid}
                            onChange={(e) => handleInputChange('prizepoolPaid', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Prizepool Calculated ($)</label>
                          <input
                            type="number"
                            value={formData.prizepoolCalculated}
                            onChange={(e) => handleInputChange('prizepoolCalculated', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div className="flex items-center col-span-2">
                          <input
                            type="checkbox"
                            id="hasGuarantee"
                            checked={formData.hasGuarantee}
                            onChange={(e) => handleInputChange('hasGuarantee', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="hasGuarantee" className="ml-2 text-sm text-gray-700">
                            Has Guarantee
                          </label>
                        </div>
                        {formData.hasGuarantee && (
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Guarantee Amount ($)</label>
                            <input
                              type="number"
                              value={formData.guaranteeAmount}
                              onChange={(e) => handleInputChange('guaranteeAmount', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Jackpot Contributions */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Jackpot Contributions</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center col-span-2">
                          <input
                            type="checkbox"
                            id="hasJackpotContributions"
                            checked={formData.hasJackpotContributions}
                            onChange={(e) => handleInputChange('hasJackpotContributions', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="hasJackpotContributions" className="ml-2 text-sm text-gray-700">
                            Has Jackpot Contributions
                          </label>
                        </div>
                        {formData.hasJackpotContributions && (
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Jackpot Contribution Amount ($)</label>
                            <input
                              type="number"
                              value={formData.jackpotContributionAmount}
                              onChange={(e) => handleInputChange('jackpotContributionAmount', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Accumulator Tickets */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Accumulator Tickets</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center col-span-2">
                          <input
                            type="checkbox"
                            id="hasAccumulatorTickets"
                            checked={formData.hasAccumulatorTickets}
                            onChange={(e) => handleInputChange('hasAccumulatorTickets', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="hasAccumulatorTickets" className="ml-2 text-sm text-gray-700">
                            Has Accumulator Tickets
                          </label>
                        </div>
                        {formData.hasAccumulatorTickets && (
                          <>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Ticket Value ($)</label>
                              <input
                                type="number"
                                value={formData.accumulatorTicketValue}
                                onChange={(e) => handleInputChange('accumulatorTicketValue', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1"># Tickets Paid</label>
                              <input
                                type="number"
                                value={formData.numberOfAccumulatorTicketsPaid}
                                onChange={(e) => handleInputChange('numberOfAccumulatorTicketsPaid', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Player Stats */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Player Statistics</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Unique Players</label>
                          <input
                            type="number"
                            value={formData.totalUniquePlayers}
                            onChange={(e) => handleInputChange('totalUniquePlayers', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Initial Entries</label>
                          <input
                            type="number"
                            value={formData.totalInitialEntries}
                            onChange={(e) => handleInputChange('totalInitialEntries', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Total Entries</label>
                          <input
                            type="number"
                            value={formData.totalEntries}
                            onChange={(e) => handleInputChange('totalEntries', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Rebuys</label>
                          <input
                            type="number"
                            value={formData.totalRebuys}
                            onChange={(e) => handleInputChange('totalRebuys', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Add-ons</label>
                          <input
                            type="number"
                            value={formData.totalAddons}
                            onChange={(e) => handleInputChange('totalAddons', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Classification Flags */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Classification</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="isRegular"
                            checked={formData.isRegular}
                            onChange={(e) => handleInputChange('isRegular', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="isRegular" className="ml-2 text-sm text-gray-700">Regular Game</label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="isSatellite"
                            checked={formData.isSatellite}
                            onChange={(e) => handleInputChange('isSatellite', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="isSatellite" className="ml-2 text-sm text-gray-700">Satellite</label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="dealerDealt"
                            checked={formData.dealerDealt}
                            onChange={(e) => handleInputChange('dealerDealt', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="dealerDealt" className="ml-2 text-sm text-gray-700">Dealer Dealt</label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="isSeries"
                            checked={formData.isSeries}
                            onChange={(e) => handleInputChange('isSeries', e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor="isSeries" className="ml-2 text-sm text-gray-700">Part of Series</label>
                        </div>
                      </div>
                    </div>

                    {/* Series Info (conditional) */}
                    {formData.isSeries && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Series Information</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Series Name</label>
                            <input
                              type="text"
                              value={formData.seriesName}
                              onChange={(e) => handleInputChange('seriesName', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Event #</label>
                            <input
                              type="number"
                              value={formData.eventNumber}
                              onChange={(e) => handleInputChange('eventNumber', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Day #</label>
                            <input
                              type="number"
                              value={formData.dayNumber}
                              onChange={(e) => handleInputChange('dayNumber', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Flight Letter</label>
                            <input
                              type="text"
                              value={formData.flightLetter}
                              onChange={(e) => handleInputChange('flightLetter', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              maxLength={2}
                            />
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="isMainEvent"
                              checked={formData.isMainEvent}
                              onChange={(e) => handleInputChange('isMainEvent', e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="isMainEvent" className="ml-2 text-sm text-gray-700">Main Event</label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="finalDay"
                              checked={formData.finalDay}
                              onChange={(e) => handleInputChange('finalDay', e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="finalDay" className="ml-2 text-sm text-gray-700">Final Day</label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Error Display */}
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                        {error}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
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

const PAGE_LIMIT = 1000;

export const VenueGameDetails: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedEntities, entities, loading: entityLoading } = useEntity();

  const venueId = searchParams.get('venueId') || '';
  const gameTypeKey = searchParams.get('gameTypeKey') || '';
  const entityId: string | undefined = selectedEntities[0]?.id;
  
  // Determine if we should show the entity selector (only if user has more than 1 entity)
  const showEntitySelector = entities && entities.length > 1;

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [gameName, setGameName] = useState<string>(gameTypeKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!venueId || !gameTypeKey) {
      setError('Missing venueId or gameTypeKey');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();

      // Fetch venue info
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

      // Fetch snapshots with pagination
      let nextToken: string | null = null;
      const allSnapshots: GameFinancialSnapshotWithGame[] = [];

      const { from, to } = getTimeRangeBounds(timeRange);

      const baseFilter: any = { venueId: { eq: venueId } };
      // Only add entityId filter if the venue belongs to the selected entity
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
            limit: PAGE_LIMIT,
            nextToken,
          },
        }) as any;

        const page = snapRes?.data?.listGameFinancialSnapshots;

        if (snapRes?.errors?.length) {
          console.warn('GraphQL returned partial data with errors:', snapRes.errors.length, 'errors');
        }

        const pageItems =
          page?.items?.filter((s: GameFinancialSnapshotWithGame | null) => s != null) ?? [];

        allSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
        nextToken = page?.nextToken ?? null;
      } while (nextToken);

      const validSnapshots = allSnapshots
        .filter(isValidGameSnapshot)
        .filter((s) => s.game?.venueGameTypeKey === gameTypeKey);

      console.log(
        `[VenueGameDetails] Loaded ${allSnapshots.length} total snapshots, ${validSnapshots.length} for game type "${gameTypeKey}"`
      );

      if (validSnapshots.length > 0) {
        const sortedByDate = [...validSnapshots].sort((a, b) => {
          const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
          const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
          return dateB - dateA;
        });
        setGameName(sortedByDate[0]?.game?.name ?? gameTypeKey);
      } else {
        setGameName(gameTypeKey);
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
  }, [venueId, gameTypeKey, entityId, timeRange]);

  // Handler for clicking on a row (opens edit modal)
  const handleRowClick = (gameId: string) => {
    setSelectedGameId(gameId);
    setIsModalOpen(true);
  };

  // Handler for clicking on game name (navigates to GameDetails page)
  const handleGameNameClick = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent row click from firing
    navigate(`/games/details/${gameId}`);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedGameId(null);
  };

  const handleSaveSuccess = () => {
    // Refresh data after save
    fetchData();
  };

  const gameRows = useMemo(() => buildGameRows(snapshots), [snapshots]);
  const summaryStats = useMemo(() => buildSummaryStats(snapshots), [snapshots]);

  if (entityLoading || loading) {
    return (
      <PageWrapper title="Game Details">
        <div className="py-20 text-center text-gray-400">
          Loading game details…
        </div>
      </PageWrapper>
    );
  }

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

      {/* ============ FILTERS - Same layout as VenuesDashboard ============ */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showEntitySelector && (
          <div className="w-full sm:flex-1 sm:max-w-xs">
            <MultiEntitySelector />
          </div>
        )}
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>

      <Card className="mb-6">
        <div>
          <Text className="text-xs uppercase tracking-wide text-gray-400">
            Recurring Game at {venue.name}
          </Text>
          <h2 className="text-xl font-bold text-gray-900 mt-1">
            {gameName}
          </h2>
          <Text className="mt-1 text-sm text-gray-500">
            {summaryStats.totalGames} games in selected time range
          </Text>
        </div>
      </Card>

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