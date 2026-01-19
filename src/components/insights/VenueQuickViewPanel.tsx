// components/insights/VenueQuickViewPanel.tsx
import React, { useState } from 'react';
import { Building2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Target } from 'lucide-react';
import type { VenueQuickView, VenueHealth, VenueTrendCategory } from '../../types/insights';

interface VenueQuickViewPanelProps { venues: VenueQuickView[]; showAll?: boolean; }

const formatCurrency = (value: number): string => { const isNeg = value < 0; const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value)); return isNeg ? `-${f}` : f; };

const healthConfig: Record<VenueHealth, { color: string }> = {
  EXCELLENT: { color: 'bg-green-100 text-green-700' }, GOOD: { color: 'bg-green-100 text-green-700' },
  NEEDS_ATTENTION: { color: 'bg-amber-100 text-amber-700' }, CRITICAL: { color: 'bg-red-100 text-red-700' },
};

const trendConfig: Record<VenueTrendCategory, { icon: React.ReactNode; color: string; label: string }> = {
  BREAKOUT: { icon: <TrendingUp className="w-3 h-3" />, color: 'text-green-600 bg-green-100', label: 'Breakout' },
  UPLIFT: { icon: <TrendingUp className="w-3 h-3" />, color: 'text-blue-600 bg-blue-100', label: 'Uplift' },
  STEADY: { icon: <Minus className="w-3 h-3" />, color: 'text-gray-600 bg-gray-100', label: 'Steady' },
  SOFTENING: { icon: <TrendingDown className="w-3 h-3" />, color: 'text-amber-600 bg-amber-100', label: 'Softening' },
  AT_RISK: { icon: <TrendingDown className="w-3 h-3" />, color: 'text-red-600 bg-red-100', label: 'At Risk' },
};

export const VenueQuickViewPanel: React.FC<VenueQuickViewPanelProps> = ({ venues, showAll = false }) => {
  const [expanded, setExpanded] = useState(showAll);
  if (!venues || venues.length === 0) return null;

  const sortedVenues = [...venues].sort((a, b) => b.profit - a.profit);
  const displayVenues = expanded ? sortedVenues : sortedVenues.slice(0, 4);
  const hasMore = sortedVenues.length > 4;
  const totalProfit = sortedVenues.reduce((sum, v) => sum + v.profit, 0);
  const totalGames = sortedVenues.reduce((sum, v) => sum + v.games, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-indigo-100"><Building2 className="w-5 h-5 text-indigo-600" /></div><div><h3 className="text-lg font-semibold text-gray-900">Venue Performance</h3><p className="text-sm text-gray-500">{venues.length} venue{venues.length !== 1 ? 's' : ''} • {totalGames} games</p></div></div>
        <div className="text-right"><span className="text-xs text-gray-500 block">Total Profit</span><span className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalProfit)}</span></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayVenues.map((venue, idx) => {
          const health = healthConfig[venue.health] || healthConfig.GOOD;
          const trend = trendConfig[venue.trend] || trendConfig.STEADY;
          const isProfitable = venue.profit >= 0;
          return (
            <div key={idx} className={`p-4 rounded-lg border ${!isProfitable ? 'bg-red-50 border-red-200' : venue.health === 'EXCELLENT' || venue.health === 'GOOD' ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0"><h4 className="font-semibold text-gray-900 truncate">{venue.venueName}</h4><div className="flex items-center gap-2 mt-1"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${health.color}`}>{venue.health}</span><span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${trend.color}`}>{trend.icon}{trend.label}</span></div></div>
                <span className={`text-lg font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(venue.profit)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-3"><span>{venue.games} games</span><span>•</span><span>{formatCurrency(venue.avgProfitPerGame)}/game avg</span></div>
              {venue.keyIssue && <div className="text-sm text-gray-700 mb-2"><span className="font-medium">Issue: </span>{venue.keyIssue}</div>}
              {venue.oneAction && <div className="flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded border border-blue-100"><Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /><div><span className="text-xs font-semibold text-blue-700 uppercase">Action</span><p className="text-sm text-gray-700">{venue.oneAction}</p></div></div>}
            </div>
          );
        })}
      </div>
      {hasMore && <button onClick={() => setExpanded(!expanded)} className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1 border-t pt-3">{expanded ? <><ChevronUp className="w-4 h-4" />Show Less</> : <><ChevronDown className="w-4 h-4" />Show {sortedVenues.length - 4} More Venues</>}</button>}
    </div>
  );
};

export default VenueQuickViewPanel;
