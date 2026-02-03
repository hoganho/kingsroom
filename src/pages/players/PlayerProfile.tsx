// src/pages/players/PlayerProfile.tsx
// Player Profile Page - Complete player view with all related data
// VERSION: 2.0.0 - Added Venues tab with targeting classification, fixed data display

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TrophyIcon,
  CurrencyPoundIcon,
  MapPinIcon,
  StarIcon,
  TicketIcon,
  ArrowLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  BuildingStorefrontIcon,
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
// Local type for format*TransactionType helpers that return badge info
// ============================================================================

interface TypeBadge {
  bgColor: string;
  textColor: string;
  label: string;
}

// ============================================================================
// Tab Types
// ============================================================================

type TabId = 'overview' | 'venues' | 'games' | 'transactions' | 'rewards';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: ChartBarIcon },
  { id: 'venues', label: 'Venues', icon: BuildingStorefrontIcon },
  { id: 'games', label: 'Game History', icon: TrophyIcon },
  { id: 'transactions', label: 'Transactions', icon: CurrencyPoundIcon },
  { id: 'rewards', label: 'Rewards', icon: TicketIcon },
];

// ============================================================================
// Venue Targeting Classification Helper
// ============================================================================

const formatVenueTargetingClassification = (classification: string | null | undefined) => {
  if (!classification) return { label: 'Unknown', bgColor: 'bg-gray-100', textColor: 'text-gray-800' };
  
  const classificationMap: Record<string, { label: string; bgColor: string; textColor: string; description: string }> = {
    'NOT_PLAYED': { label: 'Not Played', bgColor: 'bg-gray-100', textColor: 'text-gray-800', description: 'Registered but never played' },
    'ACTIVE_EL': { label: 'Active (Entry)', bgColor: 'bg-green-100', textColor: 'text-green-800', description: 'Played in last 30 days' },
    'ACTIVE': { label: 'Active', bgColor: 'bg-emerald-100', textColor: 'text-emerald-800', description: 'Active player' },
    'RETAIN_31_60': { label: 'Retain 31-60', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800', description: '31-60 days since last play' },
    'RETAIN_61_90': { label: 'Retain 61-90', bgColor: 'bg-amber-100', textColor: 'text-amber-800', description: '61-90 days since last play' },
    'CHURNED_91_120': { label: 'Churned 91-120', bgColor: 'bg-orange-100', textColor: 'text-orange-800', description: '91-120 days since last play' },
    'CHURNED_121_180': { label: 'Churned 121-180', bgColor: 'bg-red-100', textColor: 'text-red-800', description: '121-180 days since last play' },
    'CHURNED_181_360': { label: 'Churned 181-360', bgColor: 'bg-red-200', textColor: 'text-red-900', description: '181-360 days since last play' },
    'CHURNED_361': { label: 'Churned 361+', bgColor: 'bg-red-300', textColor: 'text-red-900', description: '361+ days since last play' },
  };
  
  return classificationMap[classification] || { 
    label: classification.replace(/_/g, ' '), 
    bgColor: 'bg-gray-100', 
    textColor: 'text-gray-800',
    description: ''
  };
};

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

  // Calculate total games from venues if summary.gamesPlayedAllTime is 0
  const totalGamesFromVenues = playerData.venues?.reduce((sum, v) => sum + (v.totalGamesPlayed || 0), 0) || 0;
  const displayTotalGames = (summary?.gamesPlayedAllTime || 0) > 0 
    ? summary?.gamesPlayedAllTime 
    : (perfStats.tournamentsPlayed > 0 ? perfStats.tournamentsPlayed : totalGamesFromVenues);

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
                  <p className="text-sm font-medium">{targeting.label}</p>
                </div>
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
          value={formatNumber(summary?.venuesVisited || playerData.venues?.length || 0)}
          subtitle={`Credits: ${formatCurrency(player.creditBalance ?? 0)}`}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
                {tab.id === 'venues' && playerData.venues?.length > 0 && (
                  <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                    {playerData.venues.length}
                  </span>
                )}
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
              displayTotalGames={displayTotalGames}
            />
          )}
          {activeTab === 'venues' && (
            <VenuesTab
              venues={playerData.venues}
              playerTargetingClassification={player.targetingClassification}
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
  displayTotalGames?: number | null;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ summary, venues, perfStats, displayTotalGames }) => (
  <div className="space-y-6">
    {/* Performance Summary */}
    <div>
      <h3 className="text-lg font-medium mb-4">Performance Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Games</p>
          <p className="text-2xl font-bold">{formatNumber(displayTotalGames || summary?.gamesPlayedAllTime || perfStats.tournamentsPlayed)}</p>
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

    {/* Quick Venue Summary */}
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Venue Activity</h3>
        <span className="text-sm text-gray-500">
          {venues.length} venue{venues.length !== 1 ? 's' : ''} visited
        </span>
      </div>
      
      {venues.length === 0 ? (
        <p className="text-gray-500">No venue data available</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {venues
            .sort((a, b) => (b.totalGamesPlayed || 0) - (a.totalGamesPlayed || 0))
            .slice(0, 6)
            .map((venue) => {
              const venueTargeting = formatVenueTargetingClassification(venue.targetingClassification);
              return (
                <div key={venue.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      <MapPinIcon className="h-5 w-5 text-indigo-500 mr-2 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">{venue.venue?.name || 'Unknown'}</h4>
                        {venue.venue?.entity?.entityName && (
                          <p className="text-xs text-gray-500">{venue.venue.entity.entityName}</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${venueTargeting.bgColor} ${venueTargeting.textColor}`}>
                      {venueTargeting.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                    <div>
                      <p className="text-gray-500 text-xs">Games</p>
                      <p className="font-semibold">{formatNumber(venue.totalGamesPlayed)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Net P/L</p>
                      <p className={`font-semibold ${getNetBalanceColor(venue.netProfit)}`}>
                        {formatCurrency(venue.netProfit, { showSign: true })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
      
      {venues.length > 6 && (
        <p className="text-sm text-gray-500 mt-3 text-center">
          Showing top 6 venues. See Venues tab for full list.
        </p>
      )}
    </div>
  </div>
);

// ============================================================================
// Venues Tab (NEW)
// ============================================================================

interface VenuesTabProps {
  venues: PlayerVenue[];
  playerTargetingClassification?: string;
}

const VenuesTab: React.FC<VenuesTabProps> = ({ venues, playerTargetingClassification: _playerTargetingClassification }) => {
  const [sortBy, setSortBy] = useState<'games' | 'netProfit' | 'lastPlayed'>('games');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedVenues = [...venues].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;
    
    switch (sortBy) {
      case 'games':
        aVal = a.totalGamesPlayed || 0;
        bVal = b.totalGamesPlayed || 0;
        break;
      case 'netProfit':
        aVal = a.netProfit || 0;
        bVal = b.netProfit || 0;
        break;
      case 'lastPlayed':
        aVal = a.lastPlayedDate || '';
        bVal = b.lastPlayedDate || '';
        break;
    }
    
    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Calculate totals
  const totals = venues.reduce((acc, v) => ({
    games: acc.games + (v.totalGamesPlayed || 0),
    buyIns: acc.buyIns + (v.totalBuyIns || 0),
    winnings: acc.winnings + (v.totalWinnings || 0),
    netProfit: acc.netProfit + (v.netProfit || 0),
  }), { games: 0, buyIns: 0, winnings: 0, netProfit: 0 });

  // Count by targeting classification
  const classificationCounts = venues.reduce((acc, v) => {
    const classification = v.targetingClassification || 'UNKNOWN';
    acc[classification] = (acc[classification] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (venues.length === 0) {
    return (
      <div className="text-center py-12">
        <BuildingStorefrontIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Venue Data</h3>
        <p className="text-gray-500">This player hasn't visited any venues yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-indigo-50 rounded-lg p-4">
          <p className="text-sm text-indigo-600 font-medium">Total Venues</p>
          <p className="text-2xl font-bold text-indigo-900">{venues.length}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 font-medium">Total Games</p>
          <p className="text-2xl font-bold">{formatNumber(totals.games)}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <p className="text-sm text-red-600 font-medium">Total Buy-ins</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(totals.buyIns)}</p>
        </div>
        <div className={`rounded-lg p-4 ${totals.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className={`text-sm font-medium ${totals.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net Profit/Loss</p>
          <p className={`text-2xl font-bold ${totals.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatCurrency(totals.netProfit, { showSign: true })}
          </p>
        </div>
      </div>

      {/* Classification Breakdown */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Venue Classification Breakdown</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(classificationCounts).map(([classification, count]) => {
            const display = formatVenueTargetingClassification(classification);
            return (
              <span
                key={classification}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${display.bgColor} ${display.textColor}`}
              >
                {display.label}: {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">All Venues ({venues.length})</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'games' | 'netProfit' | 'lastPlayed')}
            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="games">Games Played</option>
            <option value="netProfit">Net Profit</option>
            <option value="lastPlayed">Last Played</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {/* Venue List - Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Classification</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Games</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">First Played</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Last Played</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Buy-ins</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Winnings</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net P/L</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedVenues.map((venue) => {
              const venueTargeting = formatVenueTargetingClassification(venue.targetingClassification);
              const daysSinceLastPlayed = venue.lastPlayedDate
                ? Math.floor((Date.now() - new Date(venue.lastPlayedDate).getTime()) / (1000 * 60 * 60 * 24))
                : null;
              
              return (
                <tr key={venue.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <MapPinIcon className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{venue.venue?.name || 'Unknown Venue'}</p>
                        {venue.venue?.entity?.entityName && (
                          <p className="text-xs text-gray-500">{venue.venue.entity.entityName}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${venueTargeting.bgColor} ${venueTargeting.textColor}`}>
                      {venueTargeting.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center font-medium">{formatNumber(venue.totalGamesPlayed)}</td>
                  <td className="px-4 py-4 text-center text-sm text-gray-500">
                    {venue.firstPlayedDate ? formatDate(venue.firstPlayedDate) : '-'}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div>
                      <p className="text-sm">{venue.lastPlayedDate ? formatDate(venue.lastPlayedDate) : '-'}</p>
                      {daysSinceLastPlayed !== null && (
                        <p className="text-xs text-gray-500">{daysSinceLastPlayed} days ago</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-red-600">{formatCurrency(venue.totalBuyIns)}</td>
                  <td className="px-4 py-4 text-right text-green-600">{formatCurrency(venue.totalWinnings)}</td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-semibold ${getNetBalanceColor(venue.netProfit)}`}>
                      {formatCurrency(venue.netProfit, { showSign: true })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-900" colSpan={2}>
                Total ({venues.length} venues)
              </td>
              <td className="px-4 py-3 text-center font-semibold">{formatNumber(totals.games)}</td>
              <td className="px-4 py-3" colSpan={2}></td>
              <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(totals.buyIns)}</td>
              <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(totals.winnings)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`font-semibold ${getNetBalanceColor(totals.netProfit)}`}>
                  {formatCurrency(totals.netProfit, { showSign: true })}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Venue List - Mobile Cards */}
      <div className="md:hidden space-y-4">
        {sortedVenues.map((venue) => {
          const venueTargeting = formatVenueTargetingClassification(venue.targetingClassification);
          const daysSinceLastPlayed = venue.lastPlayedDate
            ? Math.floor((Date.now() - new Date(venue.lastPlayedDate).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          
          return (
            <div key={venue.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <MapPinIcon className="h-5 w-5 text-indigo-500 mr-2" />
                  <div>
                    <h4 className="font-medium text-gray-900">{venue.venue?.name || 'Unknown'}</h4>
                    {venue.venue?.entity?.entityName && (
                      <p className="text-xs text-gray-500">{venue.venue.entity.entityName}</p>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${venueTargeting.bgColor} ${venueTargeting.textColor}`}>
                  {venueTargeting.label}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Games Played</p>
                  <p className="font-semibold">{formatNumber(venue.totalGamesPlayed)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Last Played</p>
                  <p className="font-semibold">
                    {venue.lastPlayedDate ? formatDate(venue.lastPlayedDate) : '-'}
                    {daysSinceLastPlayed !== null && (
                      <span className="text-xs text-gray-400 ml-1">({daysSinceLastPlayed}d)</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Buy-ins</p>
                  <p className="font-semibold text-red-600">{formatCurrency(venue.totalBuyIns)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Winnings</p>
                  <p className="font-semibold text-green-600">{formatCurrency(venue.totalWinnings)}</p>
                </div>
                <div className="col-span-2 pt-2 border-t">
                  <p className="text-gray-500">Net Profit/Loss</p>
                  <p className={`text-lg font-bold ${getNetBalanceColor(venue.netProfit)}`}>
                    {formatCurrency(venue.netProfit, { showSign: true })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tournament
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Finish
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Buy-in
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Won
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(result.gameStartDateTime)}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{result.game?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{result.game?.venue?.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      result.finishingPlace === 1 ? 'bg-yellow-100 text-yellow-800' :
                      result.prizeWon ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {formatFinishingPosition(result.finishingPlace, result.totalRunners)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600">
                    {formatCurrency(result.totalBuyInsPaid || result.game?.buyIn)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                    {result.amountWon ? formatCurrency(result.amountWon) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                    <span className={getNetBalanceColor(result.netProfitLoss)}>
                      {formatCurrency(result.netProfitLoss, { showSign: true })}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tournament
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Re-entries
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Table/Seat
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => {
                const entryStatus = formatEntryStatus(entry.status);
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(entry.gameStartDateTime)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{entry.game?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{entry.game?.venue?.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${entryStatus.bgColor} ${entryStatus.textColor}`}>
                        {entryStatus.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">
                      {entry.numberOfReEntries || 0}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-500">
                      {entry.tableNumber && entry.seatNumber
                        ? `T${entry.tableNumber} / S${entry.seatNumber}`
                        : '-'}
                    </td>
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
    {/* Financial Transactions */}
    <div>
      <h3 className="text-lg font-medium mb-4">Financial Transactions</h3>
      {transactions.length === 0 ? (
        <p className="text-gray-500">No transactions found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Game
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => {
                const transactionType = formatTransactionType(transaction.type) as unknown as TypeBadge;
                const isDebit = ['BUY_IN', 'RE_BUY', 'ADD_ON', 'REBUY', 'ADDON'].includes(transaction.type);
                return (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(transaction.transactionDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${transactionType.bgColor} ${transactionType.textColor}`}>
                        {transactionType.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                      {isDebit ? '-' : '+'}{formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {transaction.game?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {transaction.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* Credits History */}
    <div>
      <h3 className="text-lg font-medium mb-4">Credits History</h3>
      {credits.length === 0 ? (
        <p className="text-gray-500">No credit transactions found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {credits.map((credit) => {
                const creditType = formatCreditTransactionType(credit.type) as unknown as TypeBadge;
                return (
                  <tr key={credit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(credit.transactionDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${creditType.bgColor} ${creditType.textColor}`}>
                        {creditType.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${credit.changeAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {credit.changeAmount >= 0 ? '+' : ''}{formatCurrency(credit.changeAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      {formatCurrency(credit.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {credit.reason || '-'}
                    </td>
                  </tr>
                );
              })}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {points.map((point) => {
                const pointsType = formatPointsTransactionType(point.type) as unknown as TypeBadge;
                return (
                  <tr key={point.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(point.transactionDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${pointsType.bgColor} ${pointsType.textColor}`}>
                        {pointsType.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${point.changeAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {point.changeAmount >= 0 ? '+' : ''}{formatNumber(point.changeAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      {formatNumber(point.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {point.reason || '-'}
                    </td>
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
// Rewards Tab
// ============================================================================

interface RewardsTabProps {
  tickets: PlayerTicket[];
  creditBalance?: number | null;
  pointsBalance?: number | null;
}

const RewardsTab: React.FC<RewardsTabProps> = ({ tickets, creditBalance, pointsBalance }) => (
  <div className="space-y-6">
    {/* Balances Summary */}
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-indigo-50 rounded-lg p-4">
        <p className="text-sm text-indigo-600 font-medium">Credit Balance</p>
        <p className="text-2xl font-bold text-indigo-900">{formatCurrency(creditBalance ?? 0)}</p>
      </div>
      <div className="bg-purple-50 rounded-lg p-4">
        <p className="text-sm text-purple-600 font-medium">Points Balance</p>
        <p className="text-2xl font-bold text-purple-900">{formatNumber(pointsBalance ?? 0)}</p>
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