// src/pages/players/player-tabs/EntitiesTab.tsx
// Entities Tab - Per-entity player breakdown cards

import React from 'react';

import { formatNumber } from '../../../lib/utils';
import type { EntityPlayerMetrics, VenueBreakdownItem } from './shared';

// ============================================================================
// Props
// ============================================================================

export interface EntitiesTabProps {
  entityMetrics: EntityPlayerMetrics[];
}

// ============================================================================
// Component
// ============================================================================

export const EntitiesTab: React.FC<EntitiesTabProps> = ({
  entityMetrics,
}) => (
  <div className="space-y-6">
    {/* Entity Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {entityMetrics.map((entity) => {
        let venueBreakdown: VenueBreakdownItem[] = [];
        try {
          if (entity.venueBreakdown) {
            const raw = typeof entity.venueBreakdown === 'string'
              ? JSON.parse(entity.venueBreakdown)
              : entity.venueBreakdown;
            venueBreakdown = Array.isArray(raw) ? raw : [];
          }
        } catch {
          venueBreakdown = [];
        }
        
        return (
          <div key={entity.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
              <h3 className="text-lg font-semibold text-white">{entity.entityName}</h3>
              <p className="text-sm text-slate-300">{entity.totalVenues} venues</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Player Counts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-indigo-50 rounded-lg">
                  <p className="text-2xl font-bold text-indigo-600">{formatNumber(entity.totalPlayers)}</p>
                  <p className="text-xs text-indigo-700">Total Players</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">{formatNumber(entity.activePlayerCount)}</p>
                  <p className="text-xs text-emerald-700">Active</p>
                </div>
              </div>

              {/* Cross-venue stats */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Cross-Venue Activity</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Multi-venue players</span>
                    <span className="font-medium">{formatNumber(entity.playersMultiVenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Single-venue players</span>
                    <span className="font-medium">{formatNumber(entity.playersSingleVenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shared with other entities</span>
                    <span className="font-medium">{formatNumber(entity.playersSharedWithOtherEntities)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Exclusive to entity</span>
                    <span className="font-medium">{formatNumber(entity.playersExclusiveToEntity)}</span>
                  </div>
                </div>
              </div>

              {/* Venue Breakdown */}
              {venueBreakdown.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Top Venues</p>
                  <div className="space-y-2">
                    {venueBreakdown.slice(0, 3).map((venue) => (
                      <div key={venue.venueId} className="flex justify-between text-sm">
                        <span className="text-gray-600 truncate">{venue.venueName}</span>
                        <span className="font-medium ml-2">{formatNumber(venue.playerCount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default EntitiesTab;
