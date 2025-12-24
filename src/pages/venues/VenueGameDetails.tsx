// src/pages/venues/VenueGameDetails.tsx

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
  totalDuration?: string | null;
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

function formatDateTimeForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

function formatDateTimeForDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy HH:mm');
  } catch {
    return '-';
  }
}

// ---- Game Edit Modal Component ----

interface GameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string | null;
  onSaveSuccess: () => void;
}

function GameEditModal({ isOpen, onClose, gameId, onSaveSuccess }: GameEditModalProps) {
  const [game, setGame] = useState<GameDetails | null>(null);
  const [editedGame, setEditedGame] = useState<Partial<GameDetails>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('core');

  useEffect(() => {
    if (!isOpen || !gameId) {
      setGame(null);
      setEditedGame({});
      setIsEditing(false);
      setActiveSection('core');
      return;
    }

    const fetchGame = async () => {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.graphql({
          query: getGameQuery,
          variables: { id: gameId },
        }) as any;

        const gameData = response?.data?.getGame;
        if (gameData) {
          setGame(gameData);
          setEditedGame(gameData);
        } else {
          setError('Game not found');
        }
      } catch (err: any) {
        console.error('Error fetching game:', err);
        setError(err?.message ?? 'Failed to load game details');
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [isOpen, gameId]);

  const handleInputChange = (field: keyof GameDetails, value: any) => {
    setEditedGame((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!game?.id) return;

    setSaving(true);
    setError(null);

    try {
      const client = getClient();
      
      // Build update input - only include changed fields
      const updateInput: any = { id: game.id };
      
      // Compare and include changed fields
      Object.keys(editedGame).forEach((key) => {
        const typedKey = key as keyof GameDetails;
        if (editedGame[typedKey] !== game[typedKey] && typedKey !== 'id' && typedKey !== 'createdAt' && typedKey !== 'updatedAt') {
          updateInput[typedKey] = editedGame[typedKey];
        }
      });

      // Mark as edited
      updateInput.wasEdited = true;
      updateInput.lastEditedAt = new Date().toISOString();

      await client.graphql({
        query: updateGameMutation,
        variables: { input: updateInput },
      });

      setIsEditing(false);
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving game:', err);
      setError(err?.message ?? 'Failed to save game');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'core', label: 'Core Info' },
    { id: 'scheduling', label: 'Scheduling' },
    { id: 'financials', label: 'Financials' },
    { id: 'aggregates', label: 'Aggregates' },
    { id: 'calculated', label: 'Calculated Metrics' },
    { id: 'categorization', label: 'Categorization' },
    { id: 'series', label: 'Series Info' },
    { id: 'keys', label: 'Query Keys' },
    { id: 'metadata', label: 'Metadata' },
  ];

  const renderField = (
    label: string,
    field: keyof GameDetails,
    type: 'text' | 'number' | 'select' | 'datetime' | 'boolean' | 'readonly' = 'text',
    options?: string[]
  ) => {
    const value = editedGame[field];
    const displayValue = type === 'datetime' ? formatDateTimeForDisplay(value as string) : value;

    if (!isEditing || type === 'readonly') {
      return (
        <div className="py-2 border-b border-gray-100">
          <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
          <div className="mt-0.5 text-sm font-medium text-gray-900">
            {type === 'boolean' ? (value ? 'Yes' : 'No') : (displayValue ?? '-')}
          </div>
        </div>
      );
    }

    return (
      <div className="py-2 border-b border-gray-100">
        <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
        {type === 'select' && options ? (
          <select
            value={(value as string) ?? ''}
            onChange={(e) => handleInputChange(field, e.target.value || null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          >
            <option value="">-- Select --</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : type === 'boolean' ? (
          <select
            value={value === true ? 'true' : value === false ? 'false' : ''}
            onChange={(e) => handleInputChange(field, e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          >
            <option value="">-- Select --</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : type === 'datetime' ? (
          <input
            type="datetime-local"
            value={formatDateTimeForInput(value as string)}
            onChange={(e) => handleInputChange(field, e.target.value ? new Date(e.target.value).toISOString() : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          />
        ) : type === 'number' ? (
          <input
            type="number"
            value={value != null && typeof value === 'number' ? value : ''}
            onChange={(e) => handleInputChange(field, e.target.value ? parseFloat(e.target.value) : null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          />
        ) : (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => handleInputChange(field, e.target.value || null)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
          />
        )}
      </div>
    );
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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                    {loading ? 'Loading...' : game?.name ?? 'Game Details'}
                  </Dialog.Title>
                  <div className="flex items-center gap-2">
                    {!loading && game && !isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                      >
                        <PencilSquareIcon className="h-4 w-4 mr-1" />
                        Edit
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex h-[70vh]">
                  {/* Sidebar */}
                  <div className="w-48 border-r border-gray-200 bg-gray-50 p-3">
                    <nav className="space-y-1">
                      {sections.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => setActiveSection(section.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded-md transition ${
                            activeSection === section.id
                              ? 'bg-indigo-100 text-indigo-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {section.label}
                        </button>
                      ))}
                    </nav>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        Loading game details...
                      </div>
                    )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                        {error}
                      </div>
                    )}

                    {!loading && game && (
                      <div className="space-y-1">
                        {activeSection === 'core' && (
                          <>
                            {renderField('ID', 'id', 'readonly')}
                            {renderField('Name', 'name', 'text')}
                            {renderField('Game Type', 'gameType', 'select', GAME_TYPE_OPTIONS)}
                            {renderField('Game Variant', 'gameVariant', 'select', GAME_VARIANT_OPTIONS)}
                            {renderField('Game Status', 'gameStatus', 'select', GAME_STATUS_OPTIONS)}
                            {renderField('Tournament Type', 'tournamentType', 'select', TOURNAMENT_TYPE_OPTIONS)}
                          </>
                        )}

                        {activeSection === 'scheduling' && (
                          <>
                            {renderField('Start Date/Time', 'gameStartDateTime', 'datetime')}
                            {renderField('End Date/Time', 'gameEndDateTime', 'datetime')}
                            {renderField('Registration Status', 'registrationStatus', 'select', REGISTRATION_STATUS_OPTIONS)}
                            {renderField('Total Duration', 'totalDuration', 'text')}
                            {renderField('Game Frequency', 'gameFrequency', 'select', GAME_FREQUENCY_OPTIONS)}
                            {renderField('Day of Week', 'gameDayOfWeek', 'text')}
                          </>
                        )}

                        {activeSection === 'financials' && (
                          <>
                            {renderField('Buy-in', 'buyIn', 'number')}
                            {renderField('Rake', 'rake', 'number')}
                            {renderField('Venue Fee', 'venueFee', 'number')}
                            {renderField('Starting Stack', 'startingStack', 'number')}
                            {renderField('Has Guarantee', 'hasGuarantee', 'boolean')}
                            {renderField('Guarantee Amount', 'guaranteeAmount', 'number')}
                            <div className="mt-4 pt-3 border-t border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Jackpot Contributions</h4>
                            </div>
                            {renderField('Has Jackpot Contributions', 'hasJackpotContributions', 'boolean')}
                            {renderField('Jackpot Contribution Amount', 'jackpotContributionAmount', 'number')}
                            <div className="mt-4 pt-3 border-t border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Accumulator Tickets</h4>
                            </div>
                            {renderField('Has Accumulator Tickets', 'hasAccumulatorTickets', 'boolean')}
                            {renderField('Accumulator Ticket Value', 'accumulatorTicketValue', 'number')}
                            {renderField('# Accumulator Tickets Paid', 'numberOfAccumulatorTicketsPaid', 'number')}
                          </>
                        )}

                        {activeSection === 'aggregates' && (
                          <>
                            {renderField('Prizepool Paid', 'prizepoolPaid', 'number')}
                            {renderField('Prizepool Calculated', 'prizepoolCalculated', 'number')}
                            {renderField('Total Unique Players', 'totalUniquePlayers', 'number')}
                            {renderField('Total Rebuys', 'totalRebuys', 'number')}
                            {renderField('Total Add-ons', 'totalAddons', 'number')}
                            {renderField('Total Initial Entries', 'totalInitialEntries', 'number')}
                            {renderField('Total Entries', 'totalEntries', 'number')}
                            {renderField('Players Remaining', 'playersRemaining', 'number')}
                            {renderField('Total Chips in Play', 'totalChipsInPlay', 'number')}
                            {renderField('Average Player Stack', 'averagePlayerStack', 'number')}
                          </>
                        )}

                        {activeSection === 'calculated' && (
                          <>
                            {renderField('Total Buy-ins Collected', 'totalBuyInsCollected', 'number')}
                            {renderField('Rake Revenue', 'rakeRevenue', 'number')}
                            {renderField('Prizepool Player Contributions', 'prizepoolPlayerContributions', 'number')}
                            {renderField('Prizepool Added Value', 'prizepoolAddedValue', 'number')}
                            {renderField('Prizepool Surplus', 'prizepoolSurplus', 'number')}
                            {renderField('Guarantee Overlay Cost', 'guaranteeOverlayCost', 'number')}
                            {renderField('Game Profit', 'gameProfit', 'number')}
                          </>
                        )}

                        {activeSection === 'categorization' && (
                          <>
                            {renderField('Is Regular', 'isRegular', 'boolean')}
                            {renderField('Is Satellite', 'isSatellite', 'boolean')}
                            {renderField('Dealer Dealt', 'dealerDealt', 'boolean')}
                            {renderField('Is Partial Data', 'isPartialData', 'boolean')}
                            {renderField('Missing Flight Count', 'missingFlightCount', 'number')}
                            {renderField('Expected Total Entries', 'expectedTotalEntries', 'number')}
                            {renderField('Buy-in Bucket', 'buyInBucket', 'text')}
                          </>
                        )}

                        {activeSection === 'series' && (
                          <>
                            {renderField('Is Series', 'isSeries', 'boolean')}
                            {renderField('Series Name', 'seriesName', 'text')}
                            {renderField('Is Main Event', 'isMainEvent', 'boolean')}
                            {renderField('Event Number', 'eventNumber', 'number')}
                            {renderField('Day Number', 'dayNumber', 'number')}
                            {renderField('Flight Letter', 'flightLetter', 'text')}
                            {renderField('Final Day', 'finalDay', 'boolean')}
                            {renderField('Parent Game ID', 'parentGameId', 'text')}
                            {renderField('Consolidation Type', 'consolidationType', 'text')}
                            {renderField('Consolidation Key', 'consolidationKey', 'text')}
                          </>
                        )}

                        {activeSection === 'keys' && (
                          <>
                            {renderField('Venue Schedule Key', 'venueScheduleKey', 'text')}
                            {renderField('Venue Game Type Key', 'venueGameTypeKey', 'text')}
                            {renderField('Entity Query Key', 'entityQueryKey', 'text')}
                            {renderField('Entity Game Type Key', 'entityGameTypeKey', 'text')}
                          </>
                        )}

                        {activeSection === 'metadata' && (
                          <>
                            {renderField('Source URL', 'sourceUrl', 'text')}
                            {renderField('Tournament ID', 'tournamentId', 'number')}
                            {renderField('Venue ID', 'venueId', 'readonly')}
                            {renderField('Entity ID', 'entityId', 'readonly')}
                            {renderField('Tournament Series ID', 'tournamentSeriesId', 'text')}
                            {renderField('Was Edited', 'wasEdited', 'readonly')}
                            {renderField('Last Edited At', 'lastEditedAt', 'readonly')}
                            {renderField('Last Edited By', 'lastEditedBy', 'readonly')}
                            {renderField('Created At', 'createdAt', 'readonly')}
                            {renderField('Updated At', 'updatedAt', 'readonly')}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                {isEditing && (
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                      onClick={() => {
                        setEditedGame(game ?? {});
                        setIsEditing(false);
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// ---- Main Component ----

const PAGE_LIMIT = 500;

export const VenueGameDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedEntities, entities, loading: entityLoading } = useEntity();

  const venueId = searchParams.get('venueId');
  const gameTypeKey = searchParams.get('gameTypeKey');
  const entityId: string | undefined = selectedEntities[0]?.id;

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [gameName, setGameName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Determine if we should show the entity selector (only if user has more than 1 entity)
  // Note: entities is already filtered by user permissions in EntityContext
  const showEntitySelector = entities && entities.length > 1;

  const fetchData = async () => {
    if (!venueId || !gameTypeKey) {
      setError('Missing venue ID or game type key');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();

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

  const handleRowClick = (gameId: string) => {
    setSelectedGameId(gameId);
    setIsModalOpen(true);
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
          Game History (click a row to view/edit)
        </Text>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Game</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy-in</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Registrations</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entries</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Prizepool</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
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
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-medium text-indigo-600" title={row.name}>
                      {row.name.length > 40 ? row.name.substring(0, 40) + '...' : row.name}
                    </span>
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
                  <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={10}>
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