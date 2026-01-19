// components/insights/RecurringGameHealthPanel.tsx
import React from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Lightbulb, BarChart3, Target } from 'lucide-react';
import type { RecurringGameHealth } from '../../types/insights';

interface RecurringGameHealthPanelProps { health: RecurringGameHealth; }

const TrendIndicator: React.FC<{ trend: string }> = ({ trend }) => {
  const isPositive = trend.startsWith('+') || (!trend.startsWith('-') && parseFloat(trend) > 0);
  const isNegative = trend.startsWith('-') || parseFloat(trend) < 0;
  if (isPositive) return <span className="flex items-center gap-1 text-green-600"><TrendingUp className="w-4 h-4" />{trend}</span>;
  if (isNegative) return <span className="flex items-center gap-1 text-red-600"><TrendingDown className="w-4 h-4" />{trend}</span>;
  return <span className="flex items-center gap-1 text-gray-600"><Minus className="w-4 h-4" />{trend}</span>;
};

export const RecurringGameHealthPanel: React.FC<RecurringGameHealthPanelProps> = ({ health }) => {
  if (!health) return null;
  const hasGrowingGames = health.growing && health.growing.length > 0;
  const hasDecliningGames = health.declining && health.declining.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4"><div className="p-2 rounded-lg bg-purple-100"><Activity className="w-5 h-5 text-purple-600" /></div><div><h3 className="text-lg font-semibold text-gray-900">Recurring Game Health</h3><p className="text-sm text-gray-500">Performance trends for regular games</p></div></div>
      {health.summary && <p className="text-gray-700 mb-6 p-3 bg-gray-50 rounded-lg">{health.summary}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" />Growing Games{hasGrowingGames && <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{health.growing.length}</span>}</h4>
          {hasGrowingGames ? (
            <div className="space-y-2">{health.growing.slice(0, 5).map((game, idx) => <div key={idx} className="p-3 rounded-lg bg-green-50 border border-green-200"><div className="flex items-center justify-between mb-1"><span className="font-medium text-gray-900 truncate flex-1">{game.gameName}</span><TrendIndicator trend={game.trend} /></div>{game.action && <p className="text-sm text-green-700 flex items-center gap-1"><Target className="w-3 h-3" />{game.action}</p>}</div>)}</div>
          ) : <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg"><BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm">No growing games identified</p></div>}
        </div>
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" />Declining Games{hasDecliningGames && <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{health.declining.length}</span>}</h4>
          {hasDecliningGames ? (
            <div className="space-y-2">{health.declining.slice(0, 5).map((game, idx) => <div key={idx} className="p-3 rounded-lg bg-red-50 border border-red-200"><div className="flex items-center justify-between mb-1"><span className="font-medium text-gray-900 truncate flex-1">{game.gameName}</span><TrendIndicator trend={game.trend} /></div>{game.action && <p className="text-sm text-red-700 flex items-center gap-1"><Target className="w-3 h-3" />{game.action}</p>}</div>)}</div>
          ) : <div className="text-center py-6 text-green-600 bg-green-50 rounded-lg"><TrendingUp className="w-8 h-8 mx-auto mb-2" /><p className="text-sm font-medium">No declining games - great!</p></div>}
        </div>
      </div>
      {health.recommendation && <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200"><div className="flex items-start gap-3"><Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-semibold text-blue-800 mb-1">Game Lineup Action</h4><p className="text-sm text-blue-700">{health.recommendation}</p></div></div></div>}
    </div>
  );
};

export default RecurringGameHealthPanel;
