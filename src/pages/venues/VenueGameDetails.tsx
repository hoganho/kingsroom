// src/pages/venues/VenueGameDetails.tsx
// VERSION: 3.9.0 - Income statement style expanded view
//
// CHANGELOG:
// - v3.9.0: Income statement format for expanded row
//           - 3-column layout: Revenue | Costs | Summary
//           - Grouped costs: Staff, Prize/Guarantee, Operating
//           - Clear calculation: Revenue - Costs = Net Profit
//           - Per Player metrics section
//           - Guarantee coverage section
//           - Only shows line items with values > 0
// - v3.8.1: Better responsive column handling
//           - Added game status column with colored badges (INI, FIN, RUN, etc.)
//           - Reduced row height and column padding
//           - Responsive column hiding: Margin (sm+), Rev/Costs (md+), Buy-In/PP (lg+), GTD (xl+)
//           - Smaller text on mobile screens
// - v3.7.0: Added game status filter
//           - Multi-select dropdown to filter by gameStatus
//           - Grays out statuses not present in data
//           - Auto-selects available statuses by default
// - v3.6.0: Chart & table improvements
//           - New combo chart: bars for per-game P/L, line for cumulative P/L
//           - Table columns reordered: Date, P/L, Margin, Rev, Costs, Buy-In, PP, GTD
//           - Removed Status icon column and ID column
//           - Tournament ID now shows in expanded section next to game name
// - v3.5.0: UX improvements (row click expands, link icon for navigation)
// - v3.4.0: UI improvements (status icons, date format, column names)
// - v3.3.0: Removed FE calculations, relies on GameFinancialSnapshot only
// - v3.1.0: Optimized single-query loading via nested relationships
// - v3.0.0: BREAKING - Now queries RecurringGameInstance table

import React, { useState, useEffect, useMemo, Fragment, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Grid, Text } from '@tremor/react';
import {
  ArrowLeftIcon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
  BanknotesIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

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
] as const;

type GameStatusType = typeof GAME_STATUS_OPTIONS[number];

// Status abbreviations and colors for badges
const STATUS_CONFIG: Record<string, { abbr: string; bg: string; text: string }> = {
  INITIATING: { abbr: 'INI', bg: 'bg-slate-100', text: 'text-slate-600' },
  SCHEDULED: { abbr: 'SCHD', bg: 'bg-blue-100', text: 'text-blue-700' },
  REGISTERING: { abbr: 'REG', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  RUNNING: { abbr: 'RUN', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  CANCELLED: { abbr: 'CAN', bg: 'bg-red-100', text: 'text-red-700' },
  FINISHED: { abbr: 'FIN', bg: 'bg-green-100', text: 'text-green-700' },
  NOT_IN_USE: { abbr: 'N/U', bg: 'bg-gray-100', text: 'text-gray-500' },
  NOT_PUBLISHED: { abbr: 'N/P', bg: 'bg-amber-100', text: 'text-amber-700' },
  CLOCK_STOPPED: { abbr: 'STOP', bg: 'bg-orange-100', text: 'text-orange-700' },
  UNKNOWN: { abbr: 'UNK', bg: 'bg-purple-100', text: 'text-purple-700' },
};

const GameStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const config = STATUS_CONFIG[status] || { abbr: '?', bg: 'bg-gray-100', text: 'text-gray-500' };
  return (
    <span 
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}
      title={status.replace(/_/g, ' ')}
    >
      {config.abbr}
    </span>
  );
};

const TOURNAMENT_TYPE_OPTIONS = ['FREEZEOUT', 'REBUY', 'SATELLITE', 'DEEPSTACK'];

// Instance status types (matches RecurringGameInstanceStatus enum)
type InstanceStatus = 'CONFIRMED' | 'CANCELLED' | 'SKIPPED' | 'REPLACED' | 'UNKNOWN' | 'NO_SHOW';

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
      typicalRake
      startTime
      hasJackpotContributions
      jackpotContributionAmount
      hasAccumulatorTickets
      accumulatorTicketValue
    }
  }
`;

// Query RecurringGameInstance with nested Game and GameFinancialSnapshot
const listRecurringGameInstancesQuery = /* GraphQL */ `
  query ListRecurringGameInstances(
    $filter: ModelRecurringGameInstanceFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listRecurringGameInstances(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        recurringGameId
        recurringGameName
        expectedDate
        dayOfWeek
        weekKey
        status
        gameId
        venueId
        entityId
        hasDeviation
        deviationType
        deviationDetails
        notes
        cancellationReason
        needsReview
        reviewReason
        createdAt
        updatedAt
        game {
          id
          name
          gameStatus
          gameStartDateTime
          buyIn
          rake
          guaranteeAmount
          hasGuarantee
          totalEntries
          totalUniquePlayers
          prizepoolPaid
          prizepoolCalculated
          rakeRevenue
          gameProfit
          guaranteeOverlayCost
          tournamentId
          tournamentType
          gameType
          gameVariant
          totalRebuys
          totalAddons
          totalInitialEntries
          totalBuyInsCollected
          prizepoolPlayerContributions
          prizepoolAddedValue
          prizepoolSurplus
          venueFee
          isSeries
          gameFinancialSnapshot {
            id
            gameId
            totalRevenue
            totalCost
            netProfit
            profitMargin
            rakeRevenue
            venueFee
            totalDealerCost
            totalStaffCost
            totalTournamentDirectorCost
            totalFloorStaffCost
            totalSecurityCost
            totalGuaranteeOverlayCost
            totalAddedValueCost
            totalPrizeContribution
            totalJackpotContribution
            totalBountyCost
            totalDirectGameCost
            totalVenueRentalCost
            totalEquipmentRentalCost
            totalFoodBeverageCost
            totalOperationsCost
            totalMarketingCost
            totalStreamingCost
            totalInsuranceCost
            totalLicensingCost
            totalComplianceCost
            totalPromotionCost
            totalOtherCost
            prizepoolTotal
            prizepoolPlayerContributions
            prizepoolAddedValue
            prizepoolSurplus
            guaranteeCoverageRate
            guaranteeMet
            revenuePerPlayer
            costPerPlayer
            profitPerPlayer
            rakePerEntry
            guaranteeOverlayPerPlayer
          }
        }
      }
      nextToken
    }
  }
`;

// Query for Game (for edit modal)
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
      tournamentId
      venueId
      entityId
      recurringGameId
    }
  }
`;

const updateGameMutation = /* GraphQL */ `
  mutation UpdateGame($input: UpdateGameInput!) {
    updateGame(input: $input) {
      id
      name
      gameStatus
      buyIn
      rake
      venueFee
      hasGuarantee
      guaranteeAmount
      prizepoolPaid
      totalEntries
      totalUniquePlayers
      totalRebuys
      totalAddons
      tournamentType
      gameType
      gameVariant
      wasEdited
      lastEditedAt
    }
  }
`;

// ---- Types ----

interface RecurringGameInstance {
  id: string;
  recurringGameId: string;
  recurringGameName?: string | null;
  expectedDate: string;  // AWSDate format
  dayOfWeek: string;
  weekKey: string;
  status: InstanceStatus;
  gameId?: string | null;
  venueId: string;
  entityId: string;
  hasDeviation?: boolean | null;
  deviationType?: string | null;
  deviationDetails?: string | null;  // AWSJSON
  notes?: string | null;
  cancellationReason?: string | null;
  needsReview?: boolean | null;
  reviewReason?: string | null;
  // Nested game data (requires @belongsTo on schema)
  game?: GameData & {
    gameFinancialSnapshot?: GameFinancialSnapshotData | null;
  } | null;
}

interface GameData {
  id: string;
  name?: string | null;
  gameStatus?: string | null;
  gameStartDateTime?: string | null;
  buyIn?: number | null;
  rake?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  rakeRevenue?: number | null;
  gameProfit?: number | null;
  guaranteeOverlayCost?: number | null;
  tournamentId?: string | null;
  tournamentType?: string | null;
  gameType?: string | null;
  gameVariant?: string | null;
  totalRebuys?: number | null;
  totalAddons?: number | null;
  totalInitialEntries?: number | null;
  totalBuyInsCollected?: number | null;
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  prizepoolSurplus?: number | null;
  venueFee?: number | null;
  isSeries?: boolean | null;
  gameFinancialSnapshotId?: string | null;
  // Nested from @hasOne relationship or fallback query
  gameFinancialSnapshot?: GameFinancialSnapshotData | null;
}

interface GameFinancialSnapshotData {
  id: string;
  gameId?: string | null;
  totalRevenue?: number | null;
  totalCost?: number | null;
  netProfit?: number | null;
  profitMargin?: number | null;
  rakeRevenue?: number | null;
  venueFee?: number | null;
  totalDealerCost?: number | null;
  totalStaffCost?: number | null;
  totalTournamentDirectorCost?: number | null;
  totalFloorStaffCost?: number | null;
  totalSecurityCost?: number | null;
  totalGuaranteeOverlayCost?: number | null;
  totalAddedValueCost?: number | null;
  totalPrizeContribution?: number | null;
  totalJackpotContribution?: number | null;
  totalBountyCost?: number | null;
  totalDirectGameCost?: number | null;
  totalVenueRentalCost?: number | null;
  totalEquipmentRentalCost?: number | null;
  totalFoodBeverageCost?: number | null;
  totalOperationsCost?: number | null;
  totalMarketingCost?: number | null;
  totalStreamingCost?: number | null;
  totalInsuranceCost?: number | null;
  totalLicensingCost?: number | null;
  totalComplianceCost?: number | null;
  totalPromotionCost?: number | null;
  totalOtherCost?: number | null;
  prizepoolTotal?: number | null;
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  prizepoolSurplus?: number | null;
  guaranteeCoverageRate?: number | null;
  guaranteeMet?: boolean | null;
  revenuePerPlayer?: number | null;
  costPerPlayer?: number | null;
  profitPerPlayer?: number | null;
  rakePerEntry?: number | null;
  guaranteeOverlayPerPlayer?: number | null;
}

interface EnrichedInstance {
  instance: RecurringGameInstance;
  game?: GameData | null;
  financialSnapshot?: GameFinancialSnapshotData | null;
}

interface VenueInfo {
  id: string;
  name: string;
  entityId?: string | null;
}

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
  typicalRake?: number | null;
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
  consolidationType?: string | null;
  consolidationKey?: string | null;
  isPartialData?: boolean | null;
  missingFlightCount?: number | null;
  expectedTotalEntries?: number | null;
}

interface SummaryStats {
  totalInstances: number;
  confirmedGames: number;
  unknownGames: number;
  cancelledGames: number;
  totalEntries: number;
  totalUniquePlayers: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgProfit: number;
  avgEntries: number;
}

// ---- Utility functions ----

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const absValue = Math.abs(value);
  let formatted: string;
  if (absValue >= 1000000) {
    formatted = `$${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    formatted = `$${(absValue / 1000).toFixed(1)}K`;
  } else {
    formatted = `$${absValue.toFixed(0)}`;
  }
  return value < 0 ? `(${formatted})` : formatted;
}

function buildSummaryStats(enrichedInstances: EnrichedInstance[]): SummaryStats {
  const confirmedInstances = enrichedInstances.filter(e => e.instance.status === 'CONFIRMED');
  const unknownInstances = enrichedInstances.filter(e => 
    e.instance.status === 'UNKNOWN' || e.instance.status === 'NO_SHOW'
  );
  const cancelledInstances = enrichedInstances.filter(e => 
    e.instance.status === 'CANCELLED' || e.instance.status === 'SKIPPED' || e.instance.status === 'REPLACED'
  );

  // Only count instances that have both game AND financial data
  const confirmedWithFinancials = confirmedInstances.filter(e => e.game && e.financialSnapshot);

  const totalEntries = confirmedInstances.reduce((sum, e) => 
    sum + (e.game?.totalEntries ?? 0), 0
  );
  const totalUniquePlayers = confirmedInstances.reduce((sum, e) => 
    sum + (e.game?.totalUniquePlayers ?? 0), 0
  );
  
  // Use snapshot values only
  const totalRevenue = confirmedWithFinancials.reduce((sum, e) => 
    sum + (e.financialSnapshot?.totalRevenue ?? 0), 0
  );
  const totalCost = confirmedWithFinancials.reduce((sum, e) => 
    sum + (e.financialSnapshot?.totalCost ?? 0), 0
  );
  const totalProfit = confirmedWithFinancials.reduce((sum, e) => 
    sum + (e.financialSnapshot?.netProfit ?? 0), 0
  );

  return {
    totalInstances: enrichedInstances.length,
    confirmedGames: confirmedInstances.length,
    unknownGames: unknownInstances.length,
    cancelledGames: cancelledInstances.length,
    totalEntries,
    totalUniquePlayers,
    totalRevenue,
    totalCost,
    totalProfit,
    avgProfit: confirmedInstances.length > 0 ? totalProfit / confirmedInstances.length : 0,
    avgEntries: confirmedInstances.length > 0 ? totalEntries / confirmedInstances.length : 0,
  };
}

// ---- Game Status Multi-Select Component ----

interface GameStatusMultiSelectProps {
  allStatuses: readonly string[];
  availableStatuses: Set<string>;
  selectedStatuses: Set<string>;
  onChange: (statuses: Set<string>) => void;
  statusCounts: Record<string, number>;
}

const GameStatusMultiSelect: React.FC<GameStatusMultiSelectProps> = ({
  allStatuses,
  availableStatuses,
  selectedStatuses,
  onChange,
  statusCounts,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatus = (status: string) => {
    const newSelected = new Set(selectedStatuses);
    if (newSelected.has(status)) {
      newSelected.delete(status);
    } else {
      newSelected.add(status);
    }
    onChange(newSelected);
  };

  const selectAll = () => {
    onChange(new Set(availableStatuses));
  };

  const clearAll = () => {
    onChange(new Set());
  };

  const selectedCount = selectedStatuses.size;
  const availableCount = availableStatuses.size;

  // Format display text
  const getButtonText = () => {
    if (selectedCount === 0) return 'No statuses';
    if (selectedCount === availableCount) return 'All statuses';
    if (selectedCount === 1) return Array.from(selectedStatuses)[0];
    return `${selectedCount} statuses`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
      >
        <FunnelIcon className="h-4 w-4 text-gray-500" />
        <span>{getButtonText()}</span>
        <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-64 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {/* Header with Select All / Clear All */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Game Status
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                None
              </button>
            </div>
          </div>

          {/* Status options */}
          <div className="max-h-64 overflow-y-auto py-1">
            {allStatuses.map((status) => {
              const isAvailable = availableStatuses.has(status);
              const isSelected = selectedStatuses.has(status);
              const count = statusCounts[status] || 0;

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => isAvailable && toggleStatus(status)}
                  disabled={!isAvailable}
                  className={`
                    w-full flex items-center justify-between px-3 py-2 text-sm
                    ${isAvailable 
                      ? 'hover:bg-gray-50 cursor-pointer' 
                      : 'cursor-not-allowed'
                    }
                    ${isSelected ? 'bg-indigo-50' : ''}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <div className={`
                      w-4 h-4 rounded border flex items-center justify-center
                      ${isSelected 
                        ? 'bg-indigo-600 border-indigo-600' 
                        : isAvailable 
                          ? 'border-gray-300 bg-white' 
                          : 'border-gray-200 bg-gray-100'
                      }
                    `}>
                      {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
                    </div>
                    <span className={`
                      ${isAvailable ? 'text-gray-900' : 'text-gray-400'}
                    `}>
                      {status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className={`
                    text-xs px-1.5 py-0.5 rounded-full
                    ${isAvailable 
                      ? 'bg-gray-100 text-gray-600' 
                      : 'bg-gray-50 text-gray-400'
                    }
                  `}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- P/L Chart Component (Bar + Cumulative Line) ----

interface PLChartProps {
  instances: EnrichedInstance[];
}

const PLChart: React.FC<PLChartProps> = ({ instances }) => {
  // Sort by date (oldest first for left-to-right timeline)
  const chartData = useMemo(() => {
    const sorted = [...instances].sort((a, b) => {
      const dateA = a.instance.expectedDate || '';
      const dateB = b.instance.expectedDate || '';
      return dateA.localeCompare(dateB);
    });

    let cumulative = 0;
    return sorted.map(inst => {
      const hasData = inst.instance.status === 'CONFIRMED' && inst.game && inst.financialSnapshot;
      const profit = hasData ? (inst.financialSnapshot?.netProfit ?? 0) : 0;
      const isMissing = inst.instance.status !== 'CONFIRMED' || !inst.game;
      
      cumulative += profit;
      
      let displayDate = '';
      try {
        if (inst.instance.expectedDate) {
          displayDate = format(parseISO(inst.instance.expectedDate), 'dd MMM');
        }
      } catch {
        displayDate = '';
      }
      
      return {
        id: inst.instance.id,
        date: displayDate,
        fullDate: inst.instance.expectedDate,
        profit: isMissing ? 0 : profit,
        cumulative,
        isMissing,
        status: inst.instance.status,
      };
    });
  }, [instances]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No data available
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium text-gray-700 mb-1">{data?.fullDate ? format(parseISO(data.fullDate), 'dd MMM yyyy') : label}</p>
          {data?.isMissing ? (
            <p className="text-gray-400">No data</p>
          ) : (
            <>
              <p className={`${data?.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                P/L: {formatCurrency(data?.profit)}
              </p>
              <p className={`${data?.cumulative >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                Cumulative: {formatCurrency(data?.cumulative)}
              </p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 11 }} 
          stroke="#9ca3af"
          interval="preserveStartEnd"
        />
        <YAxis 
          yAxisId="left"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }} 
          stroke="#9ca3af"
        />
        <YAxis 
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }} 
          stroke="#10b981"
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine yAxisId="left" y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        
        {/* Bar for per-game P/L */}
        <Bar 
          yAxisId="left"
          dataKey="profit" 
          fill="#6366f1"
          radius={[2, 2, 0, 0]}
          maxBarSize={20}
        />
        
        {/* Line for cumulative P/L */}
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="cumulative" 
          stroke="#10b981" 
          strokeWidth={2}
          dot={{ r: 3, fill: '#10b981' }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// ---- Expandable P&L Row Component ----

interface PLRowProps {
  enrichedInstance: EnrichedInstance;
  onRowClick: (gameId: string) => void;
}

const PLRow: React.FC<PLRowProps> = ({ enrichedInstance, onRowClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { instance, game, financialSnapshot } = enrichedInstance;
  
  const isConfirmed = instance.status === 'CONFIRMED';
  const isUnknown = instance.status === 'UNKNOWN' || instance.status === 'NO_SHOW';
  const hasData = isConfirmed && game;
  const hasFinancials = hasData && financialSnapshot;

  // Row click now toggles expand (not navigate)
  const handleRowClick = () => {
    if (hasData) {
      setIsExpanded(!isExpanded);
    }
  };

  // Navigate to game details page
  const handleNavigateToGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (game?.id) {
      onRowClick(game.id);
    }
  };

  // Format date
  let displayDate = '-';
  try {
    if (instance.expectedDate) {
      displayDate = format(parseISO(instance.expectedDate), 'dd-MMM-yy');
    }
  } catch {
    displayDate = instance.expectedDate || '-';
  }

  // Use snapshot values directly
  const totalRevenue = financialSnapshot?.totalRevenue ?? 0;
  const totalCost = financialSnapshot?.totalCost ?? 0;
  const netProfit = financialSnapshot?.netProfit ?? 0;
  const profitMargin = financialSnapshot?.profitMargin ?? null;

  // Determine profit/loss color
  const profitColorClass = netProfit >= 0 ? 'text-blue-600' : 'text-red-600';
  const marginColorClass = profitMargin !== null && profitMargin >= 0 ? 'text-blue-600' : 'text-red-600';

  return (
    <>
      {/* Main Row */}
      <tr
        className={`
          border-b border-gray-100 transition-colors
          ${hasData ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-50/50'}
          ${isExpanded ? 'bg-blue-50/30' : ''}
        `}
        onClick={handleRowClick}
      >
        {/* Expand Toggle */}
        <td className="pl-2 pr-0 py-1 w-5">
          {hasData && (
            <span>
              {isExpanded ? (
                <ChevronDownIcon className="h-3.5 w-3.5 text-gray-500" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400" />
              )}
            </span>
          )}
        </td>

        {/* Date */}
        <td className="px-1 py-1 whitespace-nowrap">
          <div className="flex items-center gap-0.5">
            <span className={`text-xs ${!hasData ? 'text-gray-400' : 'font-medium text-gray-900'}`}>
              {displayDate}
            </span>
            {isUnknown && (
              <ExclamationTriangleIcon className="h-3 w-3 text-amber-500 flex-shrink-0" title="Needs review" />
            )}
          </div>
        </td>

        {/* Status Badge */}
        <td className="px-1 py-1">
          <GameStatusBadge status={game?.gameStatus} />
        </td>

        {/* P/L */}
        <td className="px-1 py-1 text-xs text-right whitespace-nowrap">
          {hasFinancials ? (
            <span className={`font-medium ${profitColorClass}`}>
              {formatCurrency(netProfit)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Margin */}
        <td className="px-1 py-1 text-xs text-right whitespace-nowrap">
          {hasFinancials && profitMargin !== null ? (
            <span className={marginColorClass}>
              {(profitMargin * 100).toFixed(0)}%
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Revenue */}
        <td className="px-1 py-1 text-xs text-right whitespace-nowrap hidden sm:table-cell">
          {hasFinancials ? (
            <span className="text-emerald-600">{formatCurrency(totalRevenue)}</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Costs */}
        <td className="px-1 py-1 text-xs text-right whitespace-nowrap hidden sm:table-cell">
          {hasFinancials ? (
            <span className="text-red-600">{formatCurrency(totalCost)}</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Buy-In */}
        <td className="px-1 py-1 text-xs text-right text-gray-700 whitespace-nowrap hidden lg:table-cell">
          {hasData && game?.buyIn ? formatCurrency(game.buyIn) : '-'}
        </td>

        {/* Prizepool */}
        <td className="px-1 py-1 text-xs text-right text-gray-700 whitespace-nowrap hidden lg:table-cell">
          {hasData && game?.prizepoolPaid ? formatCurrency(game.prizepoolPaid) : '-'}
        </td>

        {/* Guarantee */}
        <td className="px-1 py-1 text-xs text-right text-gray-700 whitespace-nowrap hidden xl:table-cell pr-2">
          {hasData && game?.hasGuarantee && game?.guaranteeAmount
            ? formatCurrency(game.guaranteeAmount)
            : '-'}
        </td>
      </tr>

      {/* Expanded Details Row - Income Statement Format */}
      {isExpanded && hasData && (
        <tr className="bg-slate-50/80 border-b border-gray-200">
          <td colSpan={10} className="px-3 py-3">
            {/* Header: Game Info */}
            <div className="flex items-start justify-between mb-3 pb-2 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{game?.name || 'Unnamed Game'}</span>
                  <button
                    onClick={handleNavigateToGame}
                    className="p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                    title="Edit game"
                  >
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {game?.tournamentId && (
                  <span className="text-xs text-gray-400">ID: {game.tournamentId}</span>
                )}
              </div>
              <div className="text-right text-xs text-gray-500">
                <div>{game?.totalEntries ?? 0} entries ({game?.totalUniquePlayers ?? 0} unique)</div>
                {(game?.totalRebuys || game?.totalAddons) ? (
                  <div>{game?.totalRebuys ?? 0} rebuys • {game?.totalAddons ?? 0} add-ons</div>
                ) : null}
              </div>
            </div>

            {/* Income Statement Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              
              {/* Column 1: Revenue */}
              <div>
                <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1.5 pb-1 border-b border-gray-200">
                  Revenue
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rake Revenue</span>
                    <span className="text-gray-900">{formatCurrency(financialSnapshot?.rakeRevenue)}</span>
                  </div>
                  {(financialSnapshot?.venueFee ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Venue Fee</span>
                      <span className="text-gray-900">{formatCurrency(financialSnapshot?.venueFee)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between mt-2 pt-1.5 border-t border-gray-300 font-semibold">
                  <span className="text-gray-700">Total Revenue</span>
                  <span className="text-emerald-600">{formatCurrency(financialSnapshot?.totalRevenue)}</span>
                </div>

                {/* Prizepool Info (non-financial context) */}
                <div className="mt-3 pt-2 border-t border-dashed border-gray-200">
                  <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1">
                    Prizepool
                  </div>
                  <div className="space-y-0.5 text-gray-500">
                    <div className="flex justify-between">
                      <span>Player Contrib.</span>
                      <span>{formatCurrency(financialSnapshot?.prizepoolPlayerContributions)}</span>
                    </div>
                    {(financialSnapshot?.prizepoolAddedValue ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Added Value</span>
                        <span>{formatCurrency(financialSnapshot?.prizepoolAddedValue)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium text-gray-700">
                      <span>Total Paid</span>
                      <span>{formatCurrency(game?.prizepoolPaid)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Costs */}
              <div>
                <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1.5 pb-1 border-b border-gray-200">
                  Costs
                </div>
                
                {/* Staff Costs */}
                {((financialSnapshot?.totalDealerCost ?? 0) > 0 || 
                  (financialSnapshot?.totalTournamentDirectorCost ?? 0) > 0 ||
                  (financialSnapshot?.totalFloorStaffCost ?? 0) > 0 ||
                  (financialSnapshot?.totalSecurityCost ?? 0) > 0) && (
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">Staff</div>
                    <div className="space-y-0.5 pl-2 border-l-2 border-gray-200">
                      {(financialSnapshot?.totalDealerCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Dealers</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalDealerCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalTournamentDirectorCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tournament Director</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalTournamentDirectorCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalFloorStaffCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Floor Staff</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalFloorStaffCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalSecurityCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Security</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalSecurityCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Prize/Guarantee Costs */}
                {((financialSnapshot?.totalGuaranteeOverlayCost ?? 0) > 0 || 
                  (financialSnapshot?.totalAddedValueCost ?? 0) > 0 ||
                  (financialSnapshot?.totalPrizeContribution ?? 0) > 0 ||
                  (financialSnapshot?.totalJackpotContribution ?? 0) > 0 ||
                  (financialSnapshot?.totalBountyCost ?? 0) > 0) && (
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">Prize & Guarantee</div>
                    <div className="space-y-0.5 pl-2 border-l-2 border-gray-200">
                      {(financialSnapshot?.totalGuaranteeOverlayCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Guarantee Overlay</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalGuaranteeOverlayCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalAddedValueCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Added Value</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalAddedValueCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalPrizeContribution ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Prize Contribution</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalPrizeContribution)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalJackpotContribution ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Jackpot Contrib.</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalJackpotContribution)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalBountyCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bounty</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalBountyCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Operating Costs */}
                {((financialSnapshot?.totalVenueRentalCost ?? 0) > 0 || 
                  (financialSnapshot?.totalEquipmentRentalCost ?? 0) > 0 ||
                  (financialSnapshot?.totalFoodBeverageCost ?? 0) > 0 ||
                  (financialSnapshot?.totalMarketingCost ?? 0) > 0 ||
                  (financialSnapshot?.totalPromotionCost ?? 0) > 0 ||
                  (financialSnapshot?.totalOtherCost ?? 0) > 0) && (
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">Operating</div>
                    <div className="space-y-0.5 pl-2 border-l-2 border-gray-200">
                      {(financialSnapshot?.totalVenueRentalCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Venue Rental</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalVenueRentalCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalEquipmentRentalCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Equipment</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalEquipmentRentalCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalFoodBeverageCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">F&B</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalFoodBeverageCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalMarketingCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Marketing</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalMarketingCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalPromotionCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Promotion</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalPromotionCost)}</span>
                        </div>
                      )}
                      {(financialSnapshot?.totalOtherCost ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Other</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalOtherCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-2 pt-1.5 border-t border-gray-300 font-semibold">
                  <span className="text-gray-700">Total Costs</span>
                  <span className="text-red-600">{formatCurrency(financialSnapshot?.totalCost)}</span>
                </div>
              </div>

              {/* Column 3: Summary / Net Profit */}
              <div>
                <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1.5 pb-1 border-b border-gray-200">
                  Summary
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Revenue</span>
                    <span className="text-emerald-600">{formatCurrency(financialSnapshot?.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Less: Costs</span>
                    <span className="text-red-600">({formatCurrency(Math.abs(financialSnapshot?.totalCost ?? 0))})</span>
                  </div>
                  <div className="flex justify-between pt-2 mt-1 border-t-2 border-gray-400 font-bold text-sm">
                    <span className="text-gray-900">Net Profit</span>
                    <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Margin</span>
                    <span className={profitMargin !== null && profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {profitMargin !== null ? `${(profitMargin * 100).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                </div>

                {/* Per Player Metrics */}
                <div className="mt-3 pt-2 border-t border-dashed border-gray-200">
                  <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1">
                    Per Player
                  </div>
                  <div className="space-y-0.5 text-gray-500">
                    <div className="flex justify-between">
                      <span>Revenue</span>
                      <span>{formatCurrency(financialSnapshot?.revenuePerPlayer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost</span>
                      <span>{formatCurrency(financialSnapshot?.costPerPlayer)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-gray-700">
                      <span>Profit</span>
                      <span className={((financialSnapshot?.profitPerPlayer ?? 0) >= 0) ? 'text-emerald-600' : 'text-red-600'}>
                        {formatCurrency(financialSnapshot?.profitPerPlayer)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Guarantee Info */}
                {game?.hasGuarantee && (
                  <div className="mt-3 pt-2 border-t border-dashed border-gray-200">
                    <div className="font-semibold text-gray-700 uppercase tracking-wide text-[10px] mb-1">
                      Guarantee
                    </div>
                    <div className="space-y-0.5 text-gray-500">
                      <div className="flex justify-between">
                        <span>Amount</span>
                        <span>{formatCurrency(game?.guaranteeAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Coverage</span>
                        <span className={((financialSnapshot?.guaranteeCoverageRate ?? 0) >= 1) ? 'text-emerald-600' : 'text-amber-600'}>
                          {financialSnapshot?.guaranteeCoverageRate 
                            ? `${(financialSnapshot.guaranteeCoverageRate * 100).toFixed(0)}%` 
                            : '-'}
                        </span>
                      </div>
                      {(financialSnapshot?.totalGuaranteeOverlayCost ?? 0) > 0 && (
                        <div className="flex justify-between font-medium">
                          <span>Overlay</span>
                          <span className="text-red-600">{formatCurrency(financialSnapshot?.totalGuaranteeOverlayCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {instance.notes && (
              <div className="mt-3 pt-2 border-t border-gray-200">
                <span className="text-[10px] text-gray-500 uppercase">Notes: </span>
                <span className="text-xs text-gray-700">{instance.notes}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

// ---- Game Edit Modal Component ----

interface GameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string | null;
  onSaveSuccess: () => void;
}

const GameEditModal: React.FC<GameEditModalProps> = ({
  isOpen,
  onClose,
  gameId,
  onSaveSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null);
  const [formData, setFormData] = useState<Partial<GameDetails>>({});

  useEffect(() => {
    if (isOpen && gameId) {
      loadGameDetails();
    } else {
      setGameDetails(null);
      setFormData({});
      setError(null);
    }
  }, [isOpen, gameId]);

  const loadGameDetails = async () => {
    if (!gameId) return;
    
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
        setFormData(game);
      } else {
        setError('Game not found');
      }
    } catch (err: any) {
      console.error('Error loading game:', err);
      setError(err?.message ?? 'Failed to load game');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!gameId || !formData) return;

    setSaving(true);
    setError(null);

    try {
      const client = getClient();

      const input = {
        id: gameId,
        gameStatus: formData.gameStatus,
        tournamentType: formData.tournamentType,
        buyIn: formData.buyIn,
        rake: formData.rake,
        venueFee: formData.venueFee,
        hasGuarantee: formData.hasGuarantee,
        guaranteeAmount: formData.guaranteeAmount,
        prizepoolPaid: formData.prizepoolPaid,
        totalEntries: formData.totalEntries,
        totalUniquePlayers: formData.totalUniquePlayers,
        totalRebuys: formData.totalRebuys,
        totalAddons: formData.totalAddons,
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
                          onChange={(e) => handleFieldChange('tournamentType', e.target.value || null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                          <option value="">None</option>
                          {TOURNAMENT_TYPE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Financial Fields */}
                    <div className="grid grid-cols-3 gap-4">
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
                        <label className="block text-xs font-medium text-gray-700 mb-1">Venue Fee ($)</label>
                        <input
                          type="number"
                          value={formData.venueFee ?? ''}
                          onChange={(e) => handleFieldChange('venueFee', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="hasGuarantee"
                          checked={formData.hasGuarantee ?? false}
                          onChange={(e) => handleFieldChange('hasGuarantee', e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="hasGuarantee" className="text-sm text-gray-700">Has Guarantee</label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Guarantee Amount ($)</label>
                        <input
                          type="number"
                          value={formData.guaranteeAmount ?? ''}
                          onChange={(e) => handleFieldChange('guaranteeAmount', e.target.value ? parseFloat(e.target.value) : null)}
                          disabled={!formData.hasGuarantee}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    {/* Entry Fields */}
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Total Entries</label>
                        <input
                          type="number"
                          value={formData.totalEntries ?? ''}
                          onChange={(e) => handleFieldChange('totalEntries', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unique Players</label>
                        <input
                          type="number"
                          value={formData.totalUniquePlayers ?? ''}
                          onChange={(e) => handleFieldChange('totalUniquePlayers', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Rebuys</label>
                        <input
                          type="number"
                          value={formData.totalRebuys ?? ''}
                          onChange={(e) => handleFieldChange('totalRebuys', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Add-ons</label>
                        <input
                          type="number"
                          value={formData.totalAddons ?? ''}
                          onChange={(e) => handleFieldChange('totalAddons', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                      </div>
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

                    {/* Action buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50"
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

  const entityId: string | undefined = selectedEntities[0]?.id;
  const showEntitySelector = entities && entities.length > 1;

  const venueId = searchParams.get('venueId') || '';
  const recurringGameId = searchParams.get('recurringGameId') || '';
  
  // Legacy param check
  const isLegacyParam = searchParams.has('gameTypeKey');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [recurringGame, setRecurringGame] = useState<RecurringGameInfo | null>(null);
  const [gameName, setGameName] = useState<string>('');
  const [allEnrichedInstances, setAllEnrichedInstances] = useState<EnrichedInstance[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  
  // Game status filter state
  const [selectedGameStatuses, setSelectedGameStatuses] = useState<Set<string>>(new Set());
  const [hasInitializedFilter, setHasInitializedFilter] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // Compute available game statuses and their counts from the data
  const { availableStatuses, statusCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    
    allEnrichedInstances.forEach(e => {
      const status = e.game?.gameStatus;
      if (status) {
        counts[status] = (counts[status] || 0) + 1;
      }
    });
    
    return {
      availableStatuses: new Set(Object.keys(counts)),
      statusCounts: counts,
    };
  }, [allEnrichedInstances]);

  // Auto-select all available statuses when data loads (only once)
  useEffect(() => {
    if (availableStatuses.size > 0 && !hasInitializedFilter) {
      setSelectedGameStatuses(new Set(availableStatuses));
      setHasInitializedFilter(true);
    }
  }, [availableStatuses, hasInitializedFilter]);

  // Reset filter initialization when time range changes
  useEffect(() => {
    setHasInitializedFilter(false);
  }, [timeRange]);

  // Filter enriched instances based on selected game statuses
  const enrichedInstances = useMemo(() => {
    // If no filter selected, show all (including instances without game data)
    if (selectedGameStatuses.size === 0) {
      return allEnrichedInstances;
    }
    
    return allEnrichedInstances.filter(e => {
      // Always include instances without game data (they'll show as no data)
      if (!e.game?.gameStatus) return true;
      return selectedGameStatuses.has(e.game.gameStatus);
    });
  }, [allEnrichedInstances, selectedGameStatuses]);

  const fetchData = async () => {
    if (!venueId || !recurringGameId) {
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

      // 2) Fetch RecurringGame details
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
        setGameName(recurringGameId);
      }

      // 3) Fetch RecurringGameInstance records
      const { from, to } = getTimeRangeBounds(timeRange);
      const allInstances: RecurringGameInstance[] = [];
      let nextToken: string | null | undefined = null;

      const baseFilter: any = {
        recurringGameId: { eq: recurringGameId },
      };

      // Use expectedDate for time filtering (AWSDate format: YYYY-MM-DD)
      if (from && to) {
        const fromDate = from.split('T')[0]; // Extract date part
        const toDate = to.split('T')[0];
        baseFilter.expectedDate = { between: [fromDate, toDate] };
      }

      do {
        const instanceRes = await client.graphql({
          query: listRecurringGameInstancesQuery,
          variables: {
            filter: baseFilter,
            limit: 500,
            nextToken,
          },
        }) as any;

        const page = instanceRes?.data?.listRecurringGameInstances;
        const pageItems = page?.items?.filter((s: any) => s != null) ?? [];
        allInstances.push(...(pageItems as RecurringGameInstance[]));
        nextToken = page?.nextToken ?? null;
      } while (nextToken);

      console.log(`[VenueGameDetails] Loaded ${allInstances.length} instances for recurring game "${recurringGameId}"`);
      
      // Debug: Log status distribution
      const statusCounts = allInstances.reduce((acc, inst) => {
        acc[inst.status] = (acc[inst.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`[VenueGameDetails] Instance status distribution:`, statusCounts);

      // Check how many have nested game data
      const withGameData = allInstances.filter(i => i.game).length;
      const withFinancials = allInstances.filter(i => i.game?.gameFinancialSnapshot).length;
      console.log(`[VenueGameDetails] Instances with game data: ${withGameData}, with financials: ${withFinancials}`);

      // 4) Build enriched instances from nested data
      const enriched: EnrichedInstance[] = allInstances
        .filter(instance => {
          // Exclude series games
          if (instance.game?.isSeries) {
            return false;
          }
          return true;
        })
        .map(instance => ({
          instance,
          game: instance.game || null,
          financialSnapshot: instance.game?.gameFinancialSnapshot || null,
        }));

      console.log(`[VenueGameDetails] Built ${enriched.length} enriched rows`);

      // Sort by expectedDate descending
      enriched.sort((a, b) => {
        const dateA = a.instance.expectedDate ? new Date(a.instance.expectedDate).getTime() : 0;
        const dateB = b.instance.expectedDate ? new Date(b.instance.expectedDate).getTime() : 0;
        return dateB - dateA;
      });

      setAllEnrichedInstances(enriched);
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

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedGameId(null);
  };

  const handleSaveSuccess = () => {
    fetchData();
  };

  const summaryStats = useMemo(() => buildSummaryStats(enrichedInstances), [enrichedInstances]);

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
        <div className="flex items-center gap-3">
          {showEntitySelector && (
            <div className="w-full sm:flex-1 sm:max-w-xs">
              <MultiEntitySelector />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
          <GameStatusMultiSelect
            allStatuses={GAME_STATUS_OPTIONS}
            availableStatuses={availableStatuses}
            selectedStatuses={selectedGameStatuses}
            onChange={setSelectedGameStatuses}
            statusCounts={statusCounts}
          />
        </div>
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
            {summaryStats.totalInstances} instances in selected time range
            {summaryStats.unknownGames > 0 && (
              <span className="ml-2 text-amber-600">
                ({summaryStats.unknownGames} need review)
              </span>
            )}
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
          label="Confirmed Games"
          value={summaryStats.confirmedGames.toLocaleString()}
          icon={<CalendarIcon className="h-6 w-6" />}
          secondary={summaryStats.unknownGames > 0 ? `${summaryStats.unknownGames} unknown` : undefined}
        />
        <MetricCard
          label="Total Players"
          value={summaryStats.totalUniquePlayers.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Entries"
          value={summaryStats.totalEntries.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
          secondary={`Avg ${summaryStats.avgEntries.toFixed(1)}/game`}
        />
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(summaryStats.totalRevenue)}
          icon={<BanknotesIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total P/L"
          value={formatCurrency(summaryStats.totalProfit)}
          icon={<TrophyIcon className="h-6 w-6" />}
          secondary={`Avg ${formatCurrency(summaryStats.avgProfit)}/game`}
        />
      </Grid>

      {/* P/L Timeline Chart */}
      {enrichedInstances.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <Text className="text-sm font-semibold">Profit Trend</Text>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-indigo-500 rounded" />
                <span>Per-game P/L</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-1 bg-emerald-500 rounded" />
                <span>Cumulative</span>
              </div>
            </div>
          </div>
          <PLChart instances={enrichedInstances} />
        </Card>
      )}

      {/* P&L Table */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <Text className="text-sm font-semibold">
            Game History P&L
          </Text>
          <Text className="text-xs text-gray-500">
            Click row to expand details
          </Text>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="pl-2 pr-0 py-2 w-5"></th>
                <th className="px-1 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-1 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">P/L</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Marg</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Rev</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Costs</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Buy-In</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">PP</th>
                <th className="px-1 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell pr-2">GTD</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {enrichedInstances.map((enrichedInstance) => (
                <PLRow
                  key={enrichedInstance.instance.id}
                  enrichedInstance={enrichedInstance}
                  onRowClick={handleRowClick}
                />
              ))}
              {enrichedInstances.length === 0 && (
                <tr>
                  <td className="px-2 py-4 text-center text-xs text-gray-500" colSpan={10}>
                    No game instances found for this recurring game.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Summary Footer */}
            {enrichedInstances.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-semibold">
                  <td className="pl-2 pr-0 py-1.5 w-5"></td>
                  <td className="px-1 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                    TOTALS ({summaryStats.confirmedGames})
                  </td>
                  <td className="px-1 py-1.5"></td>
                  <td className="px-1 py-1.5 text-xs text-right whitespace-nowrap">
                    <span className={summaryStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600'}>
                      {formatCurrency(summaryStats.totalProfit)}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-xs text-right whitespace-nowrap">
                    {summaryStats.totalRevenue > 0 ? (
                      <span className={summaryStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600'}>
                        {((summaryStats.totalProfit / summaryStats.totalRevenue) * 100).toFixed(0)}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-1 py-1.5 text-xs text-right text-emerald-600 whitespace-nowrap hidden sm:table-cell">
                    {formatCurrency(summaryStats.totalRevenue)}
                  </td>
                  <td className="px-1 py-1.5 text-xs text-right text-red-600 whitespace-nowrap hidden sm:table-cell">
                    {formatCurrency(summaryStats.totalCost)}
                  </td>
                  <td className="px-1 py-1.5 hidden lg:table-cell"></td>
                  <td className="px-1 py-1.5 hidden lg:table-cell"></td>
                  <td className="px-1 py-1.5 hidden xl:table-cell pr-2"></td>
                </tr>
              </tfoot>
            )}
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