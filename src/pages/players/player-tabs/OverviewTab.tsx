// src/pages/players/player-tabs/OverviewTab.tsx
// Overview Tab - Financial summary, activity stats, player categories, top lists
// VERSION: 3.2.0 - Fixes:
//   - Avg Net Balance / Player: Calculates from totalPlayerNetBalance/totalPlayers when stored value is 0
//   - Top Spenders: Shows avg buy-in per game next to player name
//   - Removed "Registered Last Year" metric
//   - Player Categories: Displays criteria next to each label
//   - Top Registration Venues: Falls back to entity venue breakdowns when global data is empty

import React from 'react';
import {
  CurrencyPoundIcon,
  ArrowTrendingUpIcon,
  UsersIcon,
  TrophyIcon,
  GlobeAltIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  BanknotesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import {
  formatCurrency,
  formatNumber,
} from '../../../lib/utils';

import type {
  GlobalPlayerMetrics,
  TopPlayerItem,
  TopEntityItem,
  TopVenueItem,
} from './shared';
import { MetricBox, CategoryBar, StatusCard } from './shared';

// ============================================================================
// Props
// ============================================================================

export interface OverviewTabProps {
  globalMetrics: GlobalPlayerMetrics;
  topPlayersByBalance: TopPlayerItem[];
  topPlayersByVenues: TopPlayerItem[];
  topPlayersBySpending: TopPlayerItem[];
  topEntities: TopEntityItem[];
  topVenues: TopVenueItem[];
  navigate: (path: string) => void;
  getCategoryCount: (metrics: GlobalPlayerMetrics, category: 'trialist' | 'casual' | 'committed' | 'regular' | 'vip') => number;
  calculateAvgGamesPerActivePlayer: (metrics: GlobalPlayerMetrics) => string;
}

// ============================================================================
// Component
// ============================================================================

export const OverviewTab: React.FC<OverviewTabProps> = ({
  globalMetrics,
  topPlayersByBalance,
  topPlayersByVenues,
  topPlayersBySpending,
  topEntities,
  topVenues,
  navigate,
  getCategoryCount,
  calculateAvgGamesPerActivePlayer,
}) => {
  // FIX: Calculate avgNetBalancePerPlayer from totals when the stored value is 0
  const avgNetBalance = (() => {
    if (globalMetrics.avgNetBalancePerPlayer != null && globalMetrics.avgNetBalancePerPlayer !== 0) {
      return globalMetrics.avgNetBalancePerPlayer;
    }
    // Recalculate from totals
    if (globalMetrics.totalPlayers > 0 && globalMetrics.totalPlayerNetBalance !== 0) {
      return globalMetrics.totalPlayerNetBalance / globalMetrics.totalPlayers;
    }
    return 0;
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Financial & Activity */}
      <div className="lg:col-span-2 space-y-6">
        {/* Financial Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CurrencyPoundIcon className="h-5 w-5 text-amber-500" />
            Financial Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox
              label="Total Winnings"
              value={formatCurrency(globalMetrics.totalPlayerWinnings)}
              valueColor="text-emerald-600"
            />
            <MetricBox
              label="Total Buy-ins"
              value={formatCurrency(globalMetrics.totalPlayerBuyIns)}
              valueColor="text-red-600"
            />
            <MetricBox
              label="Credit Balance"
              value={formatCurrency(globalMetrics.totalCreditBalance)}
            />
            <MetricBox
              label="Points Balance"
              value={formatNumber(globalMetrics.totalPointsBalance)}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
            {/* FIX: Use calculated avgNetBalance instead of raw field */}
            <MetricBox
              label="Avg Net Balance / Player"
              value={formatCurrency(avgNetBalance)}
              valueColor={avgNetBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
            <MetricBox
              label="Avg Games / Active Player"
              value={calculateAvgGamesPerActivePlayer(globalMetrics)}
              subtitle={`${globalMetrics.totalPlayers - globalMetrics.notPlayedCount} players with activity`}
            />
          </div>
        </div>

        {/* Activity Stats - FIX: Removed "Registered Last Year" */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="h-5 w-5 text-indigo-500" />
            Activity & Registration
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox
              label="Active Last 30 Days"
              value={formatNumber(globalMetrics.playersActiveLast30Days)}
              subtitle={`${((globalMetrics.playersActiveLast30Days / globalMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
            />
            <MetricBox
              label="Active Last 90 Days"
              value={formatNumber(globalMetrics.playersActiveLast90Days)}
              subtitle={`${((globalMetrics.playersActiveLast90Days / globalMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
            />
            <MetricBox
              label="Registered Last 30 Days"
              value={formatNumber(globalMetrics.playersRegisteredLast30Days)}
            />
            <MetricBox
              label="Registered Last 90 Days"
              value={formatNumber(globalMetrics.playersRegisteredLast90Days)}
            />
          </div>
        </div>

        {/* Player Categories - FIX: Added criteria descriptions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-violet-500" />
            Player Categories
          </h3>
          <div className="space-y-3">
            <CategoryBar
              label="Trialist"
              count={getCategoryCount(globalMetrics, 'trialist')}
              total={globalMetrics.totalPlayers}
              color="bg-emerald-500"
              criteria="<5 games, registered within 60 days"
            />
            <CategoryBar
              label="Casual"
              count={getCategoryCount(globalMetrics, 'casual')}
              total={globalMetrics.totalPlayers}
              color="bg-sky-500"
              criteria="<2 games/month avg over 90 days"
            />
            <CategoryBar
              label="Committed"
              count={getCategoryCount(globalMetrics, 'committed')}
              total={globalMetrics.totalPlayers}
              color="bg-amber-500"
              criteria="2–4 games/month over 90 days"
            />
            <CategoryBar
              label="Regular"
              count={getCategoryCount(globalMetrics, 'regular')}
              total={globalMetrics.totalPlayers}
              color="bg-indigo-500"
              criteria="3+ games/month, sustained 6+ weeks"
            />
            <CategoryBar
              label="VIP"
              count={getCategoryCount(globalMetrics, 'vip')}
              total={globalMetrics.totalPlayers}
              color="bg-purple-500"
              criteria="Top 5% by buy-ins over 12 months"
            />
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h3>
          <div className="grid grid-cols-3 gap-4">
            <StatusCard
              label="Active"
              count={globalMetrics.activePlayerCount}
              total={globalMetrics.totalPlayers}
              icon={CheckCircleIcon}
              color="emerald"
            />
            <StatusCard
              label="Suspended"
              count={globalMetrics.suspendedPlayerCount}
              total={globalMetrics.totalPlayers}
              icon={XCircleIcon}
              color="red"
            />
            <StatusCard
              label="Pending Verification"
              count={globalMetrics.pendingVerificationPlayerCount}
              total={globalMetrics.totalPlayers}
              icon={ClockIcon}
              color="amber"
            />
          </div>
        </div>
      </div>

      {/* Right Column - Top Lists */}
      <div className="space-y-6">
        {/* Top Spenders - FIX: Shows avg buy-in per game next to name */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BanknotesIcon className="h-5 w-5 text-red-500" />
              Top Spenders
            </h3>
            <p className="text-sm text-gray-500">By total buy-ins</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(topPlayersBySpending || []).slice(0, 5).map((player, index) => {
              const avgPerGame = player.gamesPlayed && player.gamesPlayed > 0
                ? (player.totalBuyIns || 0) / player.gamesPlayed
                : null;
              return (
                <div
                  key={player.playerId}
                  onClick={() => navigate(`/players/profile/${player.playerId}`)}
                  className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                      ${index === 0 ? 'bg-red-100 text-red-700' : 
                        index === 1 ? 'bg-gray-100 text-gray-700' :
                        index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}
                    `}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900 block truncate">{player.name}</span>
                      {player.gamesPlayed != null && player.gamesPlayed > 0 && (
                        <span className="text-xs text-gray-400">
                          {player.gamesPlayed} games
                          {avgPerGame != null && ` · avg ${formatCurrency(avgPerGame)}/game`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-600 flex-shrink-0 ml-2">
                    {formatCurrency(player.totalBuyIns || 0)}
                  </span>
                </div>
              );
            })}
            {(!topPlayersBySpending || topPlayersBySpending.length === 0) && (
              <div className="px-6 py-4 text-sm text-gray-500 text-center">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Top Players by Net Balance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrophyIcon className="h-5 w-5 text-amber-500" />
              Top Performers
            </h3>
            <p className="text-sm text-gray-500">By net balance</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(topPlayersByBalance || []).slice(0, 5).map((player, index) => (
              <div
                key={player.playerId}
                onClick={() => navigate(`/players/profile/${player.playerId}`)}
                className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                    ${index === 0 ? 'bg-amber-100 text-amber-700' : 
                      index === 1 ? 'bg-gray-100 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}
                  `}>
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{player.name}</span>
                </div>
                <span className={`text-sm font-semibold ${(player.netBalance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(player.netBalance || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Players by Venue Count */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GlobeAltIcon className="h-5 w-5 text-indigo-500" />
              Most Active Travelers
            </h3>
            <p className="text-sm text-gray-500">Players at most venues</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(topPlayersByVenues || []).slice(0, 5).map((player, index) => (
              <div
                key={player.playerId}
                onClick={() => navigate(`/players/profile/${player.playerId}`)}
                className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{player.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-indigo-600">{player.venueCount} venues</span>
                  {player.entityCount && player.entityCount > 1 && (
                    <span className="text-xs text-gray-500 block">{player.entityCount} entities</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Entities */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BuildingOffice2Icon className="h-5 w-5 text-violet-500" />
              Top Entities
            </h3>
            <p className="text-sm text-gray-500">By player count</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(topEntities || []).slice(0, 5).map((entity, index) => (
              <div key={entity.entityId} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{entity.entityName}</span>
                </div>
                <span className="text-sm font-semibold text-gray-600">{formatNumber(entity.playerCount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Registration Venues - FIX: Now shows data from entity venue breakdowns as fallback */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MapPinIcon className="h-5 w-5 text-emerald-500" />
              Top Registration Venues
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(topVenues || []).slice(0, 5).map((venue, index) => (
              <div key={venue.venueId} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{venue.venueName}</span>
                </div>
                <span className="text-sm font-semibold text-gray-600">
                  {formatNumber(venue.registrationCount || 0)}
                </span>
              </div>
            ))}
            {(!topVenues || topVenues.length === 0) && (
              <div className="px-6 py-4 text-sm text-gray-500 text-center">
                No registration venue data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
