// components/insights/VenueCallouts.tsx
// Venue callouts panel for AI Insights

import React from 'react';
import { Card } from '../ui/Card';
import type { VenueCallout, VenueMetrics, VenueTrendCategory, CalloutType } from '../../types/insights';

interface VenueCalloutsProps {
  venues: (VenueCallout | VenueMetrics)[];
  showRecommendations?: boolean;
  isRawData?: boolean;
}

const trendConfig: Record<VenueTrendCategory, { color: string; icon: string; label: string }> = {
  AT_RISK: { color: 'bg-red-100 text-red-800 border-red-200', icon: '📉', label: 'At Risk' },
  SOFTENING: { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: '↘️', label: 'Softening' },
  STEADY: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: '➡️', label: 'Steady' },
  UPLIFT: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '↗️', label: 'Uplift' },
  BREAKOUT: { color: 'bg-green-100 text-green-800 border-green-200', icon: '🚀', label: 'Breakout' },
};

const calloutConfig: Record<CalloutType, { icon: string; bg: string }> = {
  TOP_PERFORMER: { icon: '🏆', bg: 'bg-green-50 border-green-200' },
  NEEDS_ATTENTION: { icon: '⚠️', bg: 'bg-yellow-50 border-yellow-200' },
  TREND_CHANGE: { icon: '📊', bg: 'bg-blue-50 border-blue-200' },
  MILESTONE: { icon: '🎯', bg: 'bg-purple-50 border-purple-200' },
};

// Type guard for VenueCallout
function isVenueCallout(venue: any): venue is VenueCallout {
  return 'calloutType' in venue || 'headline' in venue;
}

export const VenueCallouts: React.FC<VenueCalloutsProps> = ({ 
  venues, 
  showRecommendations = true,
  isRawData = false 
}) => {
  if (!venues || venues.length === 0) return null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">
        {isRawData ? 'Venue Performance' : 'Venue Callouts'}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {venues.map((venue, idx) => {
          if (isVenueCallout(venue)) {
            // AI-generated callout format
            const config = calloutConfig[venue.calloutType] || calloutConfig.TREND_CHANGE;
            const trendCfg = trendConfig[venue.trendCategory] || trendConfig.STEADY;
            
            return (
              <div key={venue.venueId || idx} className={`p-4 rounded-lg border ${config.bg}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{config.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900">{venue.venueName}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded border ${trendCfg.color}`}>
                        {trendCfg.icon} {trendCfg.label}
                      </span>
                    </div>
                    
                    <p className="font-medium text-gray-800 mb-1">{venue.headline}</p>
                    <p className="text-sm text-gray-600 mb-2">{venue.details}</p>
                    
                    {showRecommendations && venue.recommendation && (
                      <div className="text-sm text-blue-700 bg-white bg-opacity-50 p-2 rounded">
                        <strong>Action:</strong> {venue.recommendation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          } else {
            // Raw VenueMetrics format
            const metrics = venue as VenueMetrics;
            const trendCfg = trendConfig[metrics.trendCategory] || trendConfig.STEADY;
            
            return (
              <div key={metrics.venueId || idx} className="p-4 rounded-lg border bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">{metrics.venueName}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded border ${trendCfg.color}`}>
                    {trendCfg.icon} {trendCfg.label}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500">Revenue</div>
                    <div className="font-semibold">
                      ${metrics.metrics.revenue.toLocaleString()}
                      {metrics.deltas?.revenuePercent !== undefined && (
                        <span className={metrics.deltas.revenuePercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {' '}({metrics.deltas.revenuePercent >= 0 ? '+' : ''}{metrics.deltas.revenuePercent.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Profit</div>
                    <div className={`font-semibold ${metrics.metrics.profit < 0 ? 'text-red-600' : ''}`}>
                      ${metrics.metrics.profit.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Entries</div>
                    <div className="font-semibold">{metrics.metrics.entries}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t">
                  <div>
                    <span className="text-gray-500">Games: </span>
                    <span className="font-medium">{metrics.metrics.gamesRun} run, {metrics.metrics.gamesCancelled} cancelled</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Margin: </span>
                    <span className={`font-medium ${metrics.metrics.profitMargin < 0 ? 'text-red-600' : ''}`}>
                      {metrics.metrics.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          }
        })}
      </div>
    </Card>
  );
};

export default VenueCallouts;
