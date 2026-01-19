// components/insights/ProblemGamesPanel.tsx
import React, { useState } from 'react';
import { AlertTriangle, TrendingDown, Users, DollarSign, Calendar, ChevronDown, ChevronUp, Lightbulb, XCircle } from 'lucide-react';
import type { ProblemGame, IssueType } from '../../types/insights';

interface ProblemGamesPanelProps { games: ProblemGame[]; showAll?: boolean; }

const issueConfig: Record<IssueType, { icon: React.ReactNode; label: string; bgColor: string; borderColor: string }> = {
  OVERLAY: { icon: <DollarSign className="w-4 h-4" />, label: 'Overlay', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  LOW_TURNOUT: { icon: <Users className="w-4 h-4" />, label: 'Low Turnout', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  HIGH_COSTS: { icon: <TrendingDown className="w-4 h-4" />, label: 'High Costs', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  CANCELLED: { icon: <XCircle className="w-4 h-4" />, label: 'Cancelled', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
};

const formatCurrency = (value: number): string => { const isNeg = value < 0; const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value)); return isNeg ? `-${f}` : f; };
const formatDate = (dateStr: string): string => { try { return new Date(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return dateStr; } };

export const ProblemGamesPanel: React.FC<ProblemGamesPanelProps> = ({ games, showAll = false }) => {
  const [expanded, setExpanded] = useState(showAll);
  if (!games || games.length === 0) return null;

  const sortedGames = [...games].sort((a, b) => a.profit - b.profit);
  const displayGames = expanded ? sortedGames : sortedGames.slice(0, 3);
  const hasMore = sortedGames.length > 3;
  const totalLoss = sortedGames.reduce((sum, g) => sum + Math.min(0, g.profit), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
          <div><h3 className="text-lg font-semibold text-gray-900">Problem Games</h3><p className="text-sm text-gray-500">{games.length} game{games.length !== 1 ? 's' : ''} need attention</p></div>
        </div>
        {totalLoss < 0 && <div className="text-right"><span className="text-xs text-gray-500 block">Total Loss</span><span className="text-lg font-bold text-red-600">{formatCurrency(totalLoss)}</span></div>}
      </div>
      <div className="space-y-3">
        {displayGames.map((game, idx) => {
          const config = issueConfig[game.issue] || issueConfig.LOW_TURNOUT;
          return (
            <div key={idx} className={`p-4 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><h4 className="font-semibold text-gray-900 truncate">{game.gameName}</h4><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{config.icon}{config.label}</span></div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 mt-1"><span>{game.venueName}</span>{game.date && <><span>•</span><span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(game.date)}</span></>}</div>
                </div>
                <div className="text-right ml-4"><span className={`text-lg font-bold ${game.profit < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(game.profit)}</span><div className="text-xs text-gray-500">{game.entries} entries</div></div>
              </div>
              {game.details && <p className="text-sm text-gray-700 mb-3">{game.details}</p>}
              {game.fix && <div className="flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded border border-blue-100"><Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /><div><span className="text-xs font-semibold text-blue-700 uppercase">Fix</span><p className="text-sm text-gray-700">{game.fix}</p></div></div>}
            </div>
          );
        })}
      </div>
      {hasMore && <button onClick={() => setExpanded(!expanded)} className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1 border-t pt-3">{expanded ? <><ChevronUp className="w-4 h-4" />Show Less</> : <><ChevronDown className="w-4 h-4" />Show {sortedGames.length - 3} More Problem Games</>}</button>}
    </div>
  );
};

export default ProblemGamesPanel;
