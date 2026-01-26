// src/pages/players/PlayerProfile.tsx
// Player Profile Page - Complete player view with all related data

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TrophyIcon,
  CurrencyPoundIcon,
  MapPinIcon,
  StarIcon,
  TicketIcon,
  ArrowLeftIcon,
  EnvelopeIcon,
  PhoneIcon,
  CalendarIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { usePlayerProfile } from '../../hooks/usePlayer';
import type {
  PlayerResult,
  PlayerEntry,
  PlayerVenue,
  PlayerTransaction,
  PlayerCredits,
  PlayerPoints,
  PlayerTicket,
  PlayerSummary,
} from '../../types/player';
import {
  formatPlayerName,
  formatPlayerInitials,
  formatDate,
  formatDateTime,
  formatStatus,
  formatCategory,
  formatTargetingClassification,
  formatROI,
  formatCashRate,
  formatEntryStatus,
  formatTicketStatus,
  formatTransactionType,
  formatCreditTransactionType,
  formatPointsTransactionType,
  formatFinishingPosition,
  getNetBalanceColor,
  calculatePerformanceStats,
} from '../../utils/playerHelpers';

import {
  formatCurrency,
  formatNumber,
} from '../../lib/utils';
// ============================================================================
// Tab Types
// ============================================================================

type TabId = 'overview' | 'games' | 'transactions' | 'rewards';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: ChartBarIcon },
  { id: 'games', label: 'Game History', icon: TrophyIcon },
  { id: 'transactions', label: 'Transactions', icon: CurrencyPoundIcon },
  { id: 'rewards', label: 'Rewards', icon: TicketIcon },
];

// ============================================================================
// Main Component
// ============================================================================

export const PlayerProfile: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { data: playerData, loading, error } = usePlayerProfile(playerId);

  // Loading State
  if (loading) {
    return (
      <PageWrapper title="Player Profile" maxWidth="7xl">
        <div className="animate-pulse space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="h-20 w-20 rounded-full bg-gray-200" />
              <div className="ml-6 flex-1 space-y-3">
                <div className="h-6 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-4">
                <div className="h-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </PageWrapper>
    );
  }

  // Error State
  if (error || !playerData) {
    return (
      <PageWrapper title="Player Profile" maxWidth="7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error || 'Player not found'}</p>
          <button
            onClick={() => navigate('/players/search')}
            className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Player Search
          </button>
        </div>
      </PageWrapper>
    );
  }

  const { player, summary } = playerData;
  const status = formatStatus(player.status);
  const category = formatCategory(player.category);
  const targeting = formatTargetingClassification(player.targetingClassification);
  const perfStats = calculatePerformanceStats(summary);

  return (
    <PageWrapper
      title={formatPlayerName(player)}
      maxWidth="7xl"
      actions={
        <button
          onClick={() => navigate('/players/search')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Search
        </button>
      }
    >
      {/* Player Header Card */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-5">
          <div className="flex items-start">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="h-20 w-20 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                <span className="text-white font-bold text-2xl">
                  {formatPlayerInitials(player)}
                </span>
              </div>
            </div>

            {/* Player Info */}
            <div className="ml-6 flex-1">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-2xl font-bold text-gray-900">
                  {formatPlayerName(player)}
                </h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bgColor} ${status.textColor}`}>
                  {status.label}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${category.bgColor} ${category.textColor}`}>
                  {category.label}
                </span>
              </div>

              {/* Contact & Details Grid */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center text-sm text-gray-500">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Member Since
                  </div>
                  <p className="text-sm font-medium">{formatDate(player.registrationDate)}</p>
                </div>
                <div>
                  <div className="flex items-center text-sm text-gray-500">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Last Played
                  </div>
                  <p className="text-sm font-medium">{formatDate(player.lastPlayedDate)}</p>
                </div>
                <div>
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPinIcon className="h-4 w-4 mr-1" />
                    Registration Venue
                  </div>
                  <p className="text-sm font-medium">{player.registrationVenue?.name || '-'}</p>
                </div>
                <div>
                  <div className="flex items-center text-sm text-gray-500">
                    <ChartBarIcon className="h-4 w-4 mr-1" />
                    Classification
                  </div>
                  <p className="text-sm font-medium" title={targeting.description}>
                    {targeting.label}
                  </p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="mt-4 flex flex-wrap gap-4">
                {player.email && (
                  <div className="flex items-center text-sm text-gray-600">
                    <EnvelopeIcon className="h-4 w-4 mr-1" />
                    <a href={`mailto:${player.email}`} className="hover:text-indigo-600">
                      {player.email}
                    </a>
                  </div>
                )}
                {player.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <PhoneIcon className="h-4 w-4 mr-1" />
                    <a href={`tel:${player.phone}`} className="hover:text-indigo-600">
                      {player.phone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={TrophyIcon}
          iconColor="text-yellow-500"
          title="Tournaments"
          value={formatNumber(perfStats.tournamentsPlayed)}
          subtitle={`${perfStats.tournamentsCashed} cashed (${formatCashRate(perfStats.tournamentsCashed, perfStats.tournamentsPlayed)})`}
        />
        <StatCard
          icon={CurrencyPoundIcon}
          iconColor={getNetBalanceColor(perfStats.netBalance)}
          title="Net Balance"
          value={formatCurrency(perfStats.netBalance, { showSign: true })}
          subtitle={`ROI: ${formatROI(perfStats.totalWinnings, perfStats.totalBuyIns)}`}
        />
        <StatCard
          icon={StarIcon}
          iconColor="text-blue-500"
          title="Points Balance"
          value={formatNumber(player.pointsBalance ?? 0)}
          subtitle="Current balance"
        />
        <StatCard
          icon={MapPinIcon}
          iconColor="text-purple-500"
          title="Venues Visited"
          value={formatNumber(summary?.venuesVisited)}
          subtitle={`Credits: ${formatCurrency(player.creditBalance ?? 0)}`}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              summary={summary}
              venues={playerData.venues}
              perfStats={perfStats}
            />
          )}
          {activeTab === 'games' && (
            <GamesTab
              results={playerData.recentResults}
              entries={playerData.recentEntries}
            />
          )}
          {activeTab === 'transactions' && (
            <TransactionsTab
              transactions={playerData.transactions}
              credits={playerData.credits}
              points={playerData.points}
            />
          )}
          {activeTab === 'rewards' && (
            <RewardsTab
              tickets={playerData.tickets}
              creditBalance={player.creditBalance}
              pointsBalance={player.pointsBalance}
            />
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  value: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, iconColor, title, value, subtitle }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <div className="flex items-center">
      <Icon className={`h-8 w-8 ${iconColor}`} />
      <div className="ml-3">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold">{value}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  </div>
);

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  summary: PlayerSummary | null;
  venues: PlayerVenue[];
  perfStats: ReturnType<typeof calculatePerformanceStats>;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ summary, venues, perfStats }) => (
  <div className="space-y-6">
    {/* Performance Summary */}
    <div>
      <h3 className="text-lg font-medium mb-4">Performance Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Games</p>
          <p className="text-2xl font-bold">{formatNumber(summary?.gamesPlayedAllTime)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Winnings</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(perfStats.totalWinnings)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Buy-ins</p>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(perfStats.totalBuyIns)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500">Avg Finish Position</p>
          <p className="text-2xl font-bold">
            {summary?.averageFinishPosition?.toFixed(1) || '-'}
          </p>
        </div>
      </div>
    </div>

    {/* Venues Played */}
    <div>
      <h3 className="text-lg font-medium mb-4">Venues Played</h3>
      {venues.length === 0 ? (
        <p className="text-gray-500">No venue data available</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues.map((venue) => (
            <div key={venue.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <h4 className="font-medium">{venue.venue?.name || 'Unknown Venue'}</h4>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Games:</span>
                  <span className="ml-1 font-medium">{formatNumber(venue.totalGamesPlayed)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Avg Buy-in:</span>
                  <span className="ml-1 font-medium">{formatCurrency(venue.averageBuyIn)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Net Profit:</span>
                  <span className={`ml-1 font-medium ${getNetBalanceColor(venue.netProfit)}`}>
                    {formatCurrency(venue.netProfit, { showSign: true })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Last Played:</span>
                  <span className="ml-1 font-medium">{formatDate(venue.lastPlayedDate)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Games Tab
// ============================================================================

interface GamesTabProps {
  results: PlayerResult[];
  entries: PlayerEntry[];
}

const GamesTab: React.FC<GamesTabProps> = ({ results, entries }) => (
  <div className="space-y-6">
    {/* Recent Results */}
    <div>
      <h3 className="text-lg font-medium mb-4">Recent Results</h3>
      {results.length === 0 ? (
        <p className="text-gray-500">No game results found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournament</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Place</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Prize</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatDate(result.game?.gameStartDateTime)}
                  </td>
                  <td className="px-4 py-3 text-sm">{result.game?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm">{result.game?.venue?.name || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatFinishingPosition(result.finishingPlace, result.totalRunners)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    <span className={result.amountWon && result.amountWon > 0 ? 'text-green-600' : ''}>
                      {result.amountWon && result.amountWon > 0 ? formatCurrency(result.amountWon) : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* Recent Entries */}
    <div>
      <h3 className="text-lg font-medium mb-4">Recent Entries</h3>
      {entries.length === 0 ? (
        <p className="text-gray-500">No recent entries found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry Type</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => {
                const entryStatus = formatEntryStatus(entry.status);
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {formatDate(entry.gameStartDateTime)}
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.game?.name || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${entryStatus.bgColor} ${entryStatus.textColor}`}>
                        {entryStatus.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.entryType || 'Initial'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Transactions Tab
// ============================================================================

interface TransactionsTabProps {
  transactions: PlayerTransaction[];
  credits: PlayerCredits[];
  points: PlayerPoints[];
}

const TransactionsTab: React.FC<TransactionsTabProps> = ({ transactions, credits, points }) => (
  <div className="space-y-6">
    {/* Transactions */}
    <div>
      <h3 className="text-lg font-medium mb-4">Recent Transactions</h3>
      {transactions.length === 0 ? (
        <p className="text-gray-500">No transactions found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatDateTime(txn.transactionDate)}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatTransactionType(txn.type)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    {formatCurrency(txn.amount, { showSign: true })}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{txn.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* Credit History */}
    <div>
      <h3 className="text-lg font-medium mb-4">Credit History</h3>
      {credits.length === 0 ? (
        <p className="text-gray-500">No credit transactions found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {credits.map((credit) => (
                <tr key={credit.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatDateTime(credit.transactionDate)}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatCreditTransactionType(credit.type)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    <span className={credit.changeAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(credit.changeAmount, { showSign: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                    {formatCurrency(credit.balanceAfter)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{credit.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* Points History */}
    <div>
      <h3 className="text-lg font-medium mb-4">Points History</h3>
      {points.length === 0 ? (
        <p className="text-gray-500">No points transactions found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {points.map((point) => (
                <tr key={point.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatDateTime(point.transactionDate)}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatPointsTransactionType(point.type)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    <span className={point.changeAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {point.changeAmount >= 0 ? '+' : ''}{formatNumber(point.changeAmount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                    {formatNumber(point.balanceAfter)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{point.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Rewards Tab
// ============================================================================

interface RewardsTabProps {
  tickets: PlayerTicket[];
  creditBalance?: number | null;
  pointsBalance?: number | null;
}

const RewardsTab: React.FC<RewardsTabProps> = ({ tickets, creditBalance, pointsBalance }) => (
  <div className="space-y-6">
    {/* Current Balances */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-green-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-green-800">Credit Balance</h4>
        <p className="text-3xl font-bold text-green-600">{formatCurrency(creditBalance ?? 0)}</p>
      </div>
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800">Points Balance</h4>
        <p className="text-3xl font-bold text-blue-600">{formatNumber(pointsBalance ?? 0)}</p>
      </div>
    </div>

    {/* Tickets */}
    <div>
      <h3 className="text-lg font-medium mb-4">Tickets</h3>
      {tickets.length === 0 ? (
        <p className="text-gray-500">No tickets found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tickets.map((ticket) => {
            const ticketStatus = formatTicketStatus(ticket.status);
            return (
              <div
                key={ticket.id}
                className={`border rounded-lg p-4 ${
                  ticket.status === 'ACTIVE' ? 'border-green-200 bg-green-50' : 'bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{ticket.programName || 'Tournament Ticket'}</h4>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(ticket.ticketValue)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${ticketStatus.bgColor} ${ticketStatus.textColor}`}>
                    {ticketStatus.label}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-500">
                  <p>Awarded: {formatDate(ticket.assignedAt)}</p>
                  {ticket.expiryDate && (
                    <p>Expires: {formatDate(ticket.expiryDate)}</p>
                  )}
                  {ticket.wonFromGame && (
                    <p>Won from: {ticket.wonFromGame.name}</p>
                  )}
                  {ticket.awardReason && (
                    <p>Reason: {ticket.awardReason}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default PlayerProfile;
