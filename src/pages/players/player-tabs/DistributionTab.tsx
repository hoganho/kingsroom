// src/pages/players/player-tabs/DistributionTab.tsx
// Distribution Tab - Venue and entity play distribution, multi-venue/entity stats

import React from 'react';
import {
  MapPinIcon,
  BuildingOffice2Icon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

import {
  formatNumber,
} from '../../../lib/utils';

import type { GlobalPlayerMetrics, TopPlayerItem } from './shared';

// ============================================================================
// Props
// ============================================================================

export interface DistributionTabProps {
  globalMetrics: GlobalPlayerMetrics;
  venueDistribution: Record<string, number> | null;
  entityDistribution: Record<string, number> | null;
  topPlayersByVenues: TopPlayerItem[];
  navigate: (path: string) => void;
  isFiltering?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export const DistributionTab: React.FC<DistributionTabProps> = ({
  globalMetrics,
  venueDistribution,
  entityDistribution,
  topPlayersByVenues,
  navigate,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Venue Distribution */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <MapPinIcon className="h-5 w-5 text-indigo-500" />
        Venue Play Distribution
      </h3>
      <p className="text-sm text-gray-500 mb-6">How many venues each player has played at</p>
      
      {venueDistribution && (
        <div className="space-y-4">
          {Object.entries(venueDistribution).map(([venues, count]) => {
            const percent = ((count / globalMetrics.totalPlayers) * 100);
            return (
              <div key={venues} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {venues === '5+' ? '5 or more venues' : `${venues} venue${venues === '1' ? '' : 's'}`}
                  </span>
                  <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      venues === '1' ? 'bg-gray-400' :
                      venues === '2' ? 'bg-blue-400' :
                      venues === '3' ? 'bg-indigo-500' :
                      venues === '4' ? 'bg-purple-500' : 'bg-violet-600'
                    }`}
                    style={{ width: `${Math.max(percent, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
        <div className="text-center p-4 bg-indigo-50 rounded-lg">
          <p className="text-2xl font-bold text-indigo-600">{formatNumber(globalMetrics.playersMultiVenue)}</p>
          <p className="text-sm text-indigo-700">Multi-venue players</p>
          <p className="text-xs text-indigo-500">
            {((globalMetrics.playersMultiVenue / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-600">{formatNumber(globalMetrics.playersSingleVenue)}</p>
          <p className="text-sm text-gray-700">Single-venue players</p>
          <p className="text-xs text-gray-500">
            {((globalMetrics.playersSingleVenue / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.avgVenuesPerPlayer?.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Avg venues per player</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.maxVenuesPlayed}</p>
            <p className="text-xs text-slate-500">Max venues (single player)</p>
          </div>
        </div>
      </div>
    </div>

    {/* Entity Distribution */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <BuildingOffice2Icon className="h-5 w-5 text-violet-500" />
        Entity Play Distribution
      </h3>
      <p className="text-sm text-gray-500 mb-6">How many entities each player has played across</p>
      
      {entityDistribution && (
        <div className="space-y-4">
          {Object.entries(entityDistribution).map(([entities, count]) => {
            const percent = ((count / globalMetrics.totalPlayers) * 100);
            return (
              <div key={entities} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {entities === '3+' ? '3 or more entities' : `${entities} entit${entities === '1' ? 'y' : 'ies'}`}
                  </span>
                  <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      entities === '1' ? 'bg-gray-400' :
                      entities === '2' ? 'bg-violet-400' : 'bg-violet-600'
                    }`}
                    style={{ width: `${Math.max(percent, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
        <div className="text-center p-4 bg-violet-50 rounded-lg">
          <p className="text-2xl font-bold text-violet-600">{formatNumber(globalMetrics.playersMultiEntity)}</p>
          <p className="text-sm text-violet-700">Multi-entity players</p>
          <p className="text-xs text-violet-500">
            {((globalMetrics.playersMultiEntity / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-600">{formatNumber(globalMetrics.playersSingleEntity)}</p>
          <p className="text-sm text-gray-700">Single-entity players</p>
          <p className="text-xs text-gray-500">
            {((globalMetrics.playersSingleEntity / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.avgEntitiesPerPlayer?.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Avg entities per player</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.maxEntitiesPlayed}</p>
            <p className="text-xs text-slate-500">Max entities (single player)</p>
          </div>
        </div>
      </div>
    </div>

    {/* Most Active Travelers */}
    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <SparklesIcon className="h-5 w-5 text-amber-500" />
        Most Active Travelers
      </h3>
      <p className="text-sm text-gray-500 mb-6">Players who have played at the most venues across all entities</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {(topPlayersByVenues || []).slice(0, 10).map((player, index) => (
          <div
            key={player.playerId}
            onClick={() => navigate(`/players/profile/${player.playerId}`)}
            className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg hover:shadow-md cursor-pointer transition-all border border-slate-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}
              `}>
                #{index + 1}
              </span>
              <span className="text-sm font-semibold text-gray-900 truncate">{player.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white rounded p-2">
                <p className="text-lg font-bold text-indigo-600">{player.venueCount}</p>
                <p className="text-xs text-gray-500">venues</p>
              </div>
              <div className="bg-white rounded p-2">
                <p className="text-lg font-bold text-violet-600">{player.entityCount || 1}</p>
                <p className="text-xs text-gray-500">entities</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {player.gamesPlayed != null && player.gamesPlayed > 0 
                ? `${formatNumber(player.gamesPlayed)} games played`
                : 'Games data pending'}
            </p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DistributionTab;
