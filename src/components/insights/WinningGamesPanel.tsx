// components/insights/WinningGamesPanel.tsx
import React, { useState } from 'react';
import { Trophy, TrendingUp, Users, Percent, ChevronDown, ChevronUp, Star, Sparkles } from 'lucide-react';
import type { WinningGame } from '../../types/insights';

interface WinningGamesPanelProps { games: WinningGame[]; showAll?: boolean; }

const formatCurrency = (value: number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
const formatPercent = (value: number): string => `${value.toFixed(1)}%`;
const getMarginBadge = (margin: number) => margin >= 30 ? { color: 'bg-green-100 text-green-700', label: 'High Margin' } : margin >= 15 ? { color: 'bg-gray-100 text-gray-700', label: 'Good Margin' } : { color: 'bg-amber-100 text-amber-700', label: 'Low Margin' };

export const WinningGamesPanel: React.FC<WinningGamesPanelProps> = ({ games, showAll = false }) => {
  const [expanded, setExpanded] = useState(showAll);
  if (!games || games.length === 0) return null;

  const sortedGames = [...games].sort((a, b) => b.profit - a.profit);
  const displayGames = expanded ? sortedGames : sortedGames.slice(0, 3);
  const hasMore = sortedGames.length > 3;
  const totalProfit = sortedGames.reduce((sum, g) => sum + g.profit, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100"><Trophy className="w-5 h-5 text-green-600" /></div>
          <div><h3 className="text-lg font-semibold text-gray-900">Winning Games</h3><p className="text-sm text-gray-500">{games.length} top performer{games.length !== 1 ? 's' : ''} this week</p></div>
        </div>
        <div className="text-right"><span className="text-xs text-gray-500 block">Combined Profit</span><span className="text-lg font-bold text-green-600">{formatCurrency(totalProfit)}</span></div>
      </div>
      <div className="space-y-3">
        {displayGames.map((game, idx) => {
          const marginBadge = getMarginBadge(game.margin);
          const isTopPerformer = idx === 0;
          return (
            <div key={idx} className={`p-4 rounded-lg border ${isTopPerformer ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">{isTopPerformer && <Star className="w-4 h-4 text-yellow-500 fill-current" />}<h4 className="font-semibold text-gray-900 truncate">{game.gameName}</h4><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${marginBadge.color}`}>{marginBadge.label}</span></div>
                  <p className="text-sm text-gray-600 mt-1">{game.venueName}</p>
                </div>
                <span className="text-lg font-bold text-green-600 ml-4">{formatCurrency(game.profit)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-3"><span className="flex items-center gap-1"><Users className="w-4 h-4 text-gray-400" />{game.entries} entries</span><span className="flex items-center gap-1"><Percent className="w-4 h-4 text-gray-400" />{formatPercent(game.margin)} margin</span><span className="flex items-center gap-1 text-green-600"><TrendingUp className="w-4 h-4 text-green-500" />Profitable</span></div>
              {game.successFactor && <div className="flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded border border-green-100"><Sparkles className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /><div><span className="text-xs font-semibold text-green-700 uppercase">Why it worked</span><p className="text-sm text-gray-700">{game.successFactor}</p></div></div>}
            </div>
          );
        })}
      </div>
      {hasMore && <button onClick={() => setExpanded(!expanded)} className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1 border-t pt-3">{expanded ? <><ChevronUp className="w-4 h-4" />Show Less</> : <><ChevronDown className="w-4 h-4" />Show {sortedGames.length - 3} More Winners</>}</button>}
    </div>
  );
};

export default WinningGamesPanel;
