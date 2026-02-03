// src/pages/players/player-tabs/shared.tsx
// Shared types, helper functions, and reusable components for Player Dashboard tabs

import React from 'react';
import { formatNumber } from '../../../lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface GlobalPlayerMetrics {
  id: string;
  timeRange: string;
  totalPlayers: number;
  totalEntities: number;
  totalVenues: number;
  activePlayerCount: number;
  suspendedPlayerCount: number;
  pendingVerificationPlayerCount: number;
  // New category counts (v2 enum) - optional for backward compatibility
  trialistPlayerCount?: number;
  casualPlayerCount?: number;
  committedPlayerCount?: number;
  regularPlayerCount: number;
  vipPlayerCount: number;
  // Legacy fields (deprecated)
  newPlayerCount: number;
  recreationalPlayerCount: number;
  lapsedPlayerCount: number;
  notPlayedCount: number;
  activeELCount: number;
  activeCount: number;
  retain31to60Count: number;
  retain61to90Count: number;
  churned91to120Count: number;
  churned121to180Count: number;
  churned181to360Count: number;
  churned361PlusCount: number;
  venuePlayDistribution: string | object;
  entityPlayDistribution: string | object;
  playersMultiVenue: number;
  playersMultiEntity: number;
  playersSingleVenue: number;
  playersSingleEntity: number;
  avgVenuesPerPlayer: number;
  avgEntitiesPerPlayer: number;
  maxVenuesPlayed: number;
  maxEntitiesPlayed: number;
  playersRegisteredLast30Days: number;
  playersRegisteredLast90Days: number;
  playersRegisteredLast365Days: number;
  playersActiveLast30Days: number;
  playersActiveLast90Days: number;
  avgGamesPerPlayer: number;
  avgNetBalancePerPlayer: number;
  totalPlayerNetBalance: number;
  totalPlayerWinnings: number;
  totalPlayerBuyIns: number;
  totalCreditBalance: number;
  totalPointsBalance: number;
  topEntitiesByPlayers: string | object;
  topVenuesByRegistrations: string | object;
  topPlayersByNetBalance: string | object;
  topPlayersByVenueCount: string | object;
  topPlayersByBuyIns?: string | object;
  calculatedAt: string;
}

export interface EntityPlayerMetrics {
  id: string;
  entityId: string;
  entityName: string;
  timeRange: string;
  totalPlayers: number;
  totalVenues: number;
  activePlayerCount: number;
  suspendedPlayerCount: number;
  pendingVerificationPlayerCount: number;
  // Category counts
  trialistPlayerCount?: number;
  casualPlayerCount?: number;
  committedPlayerCount?: number;
  regularPlayerCount: number;
  vipPlayerCount: number;
  newPlayerCount: number;
  recreationalPlayerCount: number;
  lapsedPlayerCount: number;
  // Targeting/churn counts
  notPlayedCount?: number;
  activeELCount?: number;
  activeCount?: number;
  retain31to60Count?: number;
  retain61to90Count?: number;
  churned91to120Count?: number;
  churned121to180Count?: number;
  churned181to360Count?: number;
  churned361PlusCount?: number;
  // Distribution
  playersMultiVenue: number;
  playersSingleVenue: number;
  playersSharedWithOtherEntities: number;
  playersExclusiveToEntity: number;
  avgVenuesPerPlayer?: number;
  // Registration/Activity
  playersRegisteredAllTime?: number;
  playersRegisteredLast30Days?: number;
  playersRegisteredLast90Days?: number;
  playersActiveLast30Days?: number;
  playersActiveLast90Days?: number;
  totalGamesPlayed?: number;
  avgGamesPerPlayer?: number;
  avgNetBalancePerPlayer?: number;
  // Financial
  totalPlayerNetBalance?: number;
  totalPlayerWinnings?: number;
  totalPlayerBuyIns?: number;
  totalCreditBalance?: number;
  totalPointsBalance?: number;
  // JSON fields
  venueBreakdown: string | object;
  topPlayersByNetBalance: string | object;
  topPlayersByVenueCount?: string | object;
  topPlayersByBuyIns?: string | object;
  calculatedAt?: string;
}

export interface VenueBreakdownItem {
  venueId: string;
  venueName: string;
  playerCount: number;
  activeCount: number;
  registrationCount: number;
}

export interface TopPlayerItem {
  playerId: string;
  name: string;
  netBalance?: number;
  gamesPlayed?: number;
  venueCount?: number;
  entityCount?: number;
  totalBuyIns?: number;
}

export interface TopEntityItem {
  entityId: string;
  entityName: string;
  playerCount: number;
}

export interface TopVenueItem {
  venueId: string;
  venueName: string;
  entityId?: string;
  registrationCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Parse potentially double-encoded JSON or already-parsed objects (static version for useMemo) */
export function parseJsonFieldStatic<T>(value: string | object | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === 'object') return value as T;
  try {
    let parsed = JSON.parse(value);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed as T;
  } catch {
    return null;
  }
}

/** Parse potentially double-encoded JSON or already-parsed objects */
export function parseJsonField<T>(value: string | object | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === 'object') return value as T;
  try {
    let parsed = JSON.parse(value);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed as T;
  } catch {
    return null;
  }
}

// ============================================================================
// Shared Components
// ============================================================================

// --- MetricBox ---

interface MetricBoxProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
}

export const MetricBox: React.FC<MetricBoxProps> = ({ label, value, valueColor = 'text-gray-900', subtitle }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
    {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
  </div>
);

// --- CategoryBar ---

interface CategoryBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
  criteria?: string;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({ label, count, total, color, criteria }) => {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-gray-700">{label}</span>
          {criteria && <span className="text-xs text-gray-400">({criteria})</span>}
        </div>
        <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(percent, 0.5)}%` }} />
      </div>
    </div>
  );
};

// --- StatusCard ---

interface StatusCardProps {
  label: string;
  count: number;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'emerald' | 'red' | 'amber';
}

const statusColors = {
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
};

export const StatusCard: React.FC<StatusCardProps> = ({ label, count, total, icon: Icon, color }) => {
  const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  return (
    <div className={`p-4 rounded-lg ${statusColors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-5 w-5" />
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{formatNumber(count)}</p>
      <p className="text-sm opacity-75">{percent}%</p>
    </div>
  );
};

// --- FunnelBar ---

interface FunnelBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
  description: string;
}

export const FunnelBar: React.FC<FunnelBarProps> = ({ label, count, total, color, description }) => {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-end">
        <div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-xs text-gray-400 ml-2">({description})</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{formatNumber(count)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded h-6 relative overflow-hidden">
        <div
          className={`h-6 rounded ${color} flex items-center justify-end pr-2 transition-all`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        >
          {percent > 10 && (
            <span className="text-xs text-white font-medium">{percent.toFixed(1)}%</span>
          )}
        </div>
        {percent <= 10 && percent > 0 && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600 font-medium">
            {percent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
};
