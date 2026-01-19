// components/insights/ScheduleHealthPanel.tsx
import React from 'react';
import { Calendar, XCircle, CheckCircle2, AlertTriangle, TrendingDown, Lightbulb, Clock } from 'lucide-react';
import type { ScheduleHealth } from '../../types/insights';

interface ScheduleHealthPanelProps { health: ScheduleHealth; }

const formatPercent = (value: number | null | undefined): string => value === null || value === undefined ? 'N/A' : `${value.toFixed(1)}%`;

const getHealthStatus = (complianceRate: number | null) => {
  if (complianceRate === null) return { label: 'No Data', color: 'gray', icon: <Clock className="w-4 h-4" /> };
  if (complianceRate >= 90) return { label: 'Healthy', color: 'green', icon: <CheckCircle2 className="w-4 h-4" /> };
  if (complianceRate >= 75) return { label: 'Needs Attention', color: 'amber', icon: <AlertTriangle className="w-4 h-4" /> };
  return { label: 'Critical', color: 'red', icon: <XCircle className="w-4 h-4" /> };
};

const getRecommendationBadge = (rec: string) => {
  const lower = rec.toLowerCase();
  if (lower === 'keep') return { color: 'bg-green-100 text-green-700', label: 'Keep' };
  if (lower === 'reposition') return { color: 'bg-amber-100 text-amber-700', label: 'Reposition' };
  if (lower === 'remove') return { color: 'bg-red-100 text-red-700', label: 'Remove' };
  return { color: 'bg-gray-100 text-gray-700', label: rec };
};

const statusColors: Record<string, { bg: string; text: string; badge: string }> = {
  green: { bg: 'bg-green-100', text: 'text-green-600', badge: 'bg-green-100 text-green-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  red: { bg: 'bg-red-100', text: 'text-red-600', badge: 'bg-red-100 text-red-700' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-700' },
};

export const ScheduleHealthPanel: React.FC<ScheduleHealthPanelProps> = ({ health }) => {
  if (!health) return null;
  const status = getHealthStatus(health.complianceRate);
  const hasData = health.complianceRate !== null;
  const hasCancellations = health.gamesCancelled > 0;
  const hasAtRiskGames = health.atRiskGames && health.atRiskGames.length > 0;
  const colors = statusColors[status.color] || statusColors.gray;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${colors.bg}`}><Calendar className={`w-5 h-5 ${colors.text}`} /></div><div><h3 className="text-lg font-semibold text-gray-900">Schedule Health</h3><p className="text-sm text-gray-500">Game execution & cancellation tracking</p></div></div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${colors.badge}`}>{status.icon}{status.label}</span>
      </div>
      {hasData && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${(health.complianceRate || 0) >= 90 ? 'text-green-600' : (health.complianceRate || 0) >= 75 ? 'text-amber-600' : 'text-red-600'}`}>{formatPercent(health.complianceRate)}</div><div className="text-xs text-gray-500">Compliance Rate</div></div>
          <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${(health.cancellationRate || 0) <= 10 ? 'text-green-600' : (health.cancellationRate || 0) <= 25 ? 'text-amber-600' : 'text-red-600'}`}>{formatPercent(health.cancellationRate)}</div><div className="text-xs text-gray-500">Cancellation Rate</div></div>
          <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${health.gamesCancelled === 0 ? 'text-green-600' : health.gamesCancelled <= 3 ? 'text-amber-600' : 'text-red-600'}`}>{health.gamesCancelled}</div><div className="text-xs text-gray-500">Games Cancelled</div></div>
        </div>
      )}
      {hasCancellations && health.cancellationReasons && health.cancellationReasons.length > 0 && <div className="mb-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" />Cancellation Reasons</h4><div className="flex flex-wrap gap-2">{health.cancellationReasons.map((reason, idx) => <span key={idx} className="px-2.5 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">{reason}</span>)}</div></div>}
      {hasAtRiskGames && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />At-Risk Recurring Games</h4>
          <div className="space-y-2">
            {health.atRiskGames.map((game, idx) => {
              const recBadge = getRecommendationBadge(game.recommendation);
              return (
                <div key={idx} className="p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="font-medium text-gray-900 truncate">{game.gameName}</div><div className="flex items-center gap-2 mt-1 text-sm text-gray-600"><TrendingDown className="w-3 h-3 text-red-500" />{formatPercent(game.cancellationRate)} cancellation rate</div></div><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${recBadge.color}`}>{recBadge.label}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {health.recommendation && <div className="p-4 bg-blue-50 rounded-lg border border-blue-200"><div className="flex items-start gap-3"><Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-semibold text-blue-800 mb-1">Recommendation</h4><p className="text-sm text-blue-700">{health.recommendation}</p></div></div></div>}
      {!hasData && <div className="text-center py-6 text-gray-500"><Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" /><p className="font-medium">Schedule tracking not enabled</p><p className="text-sm mt-1">Enable recurring game tracking to see cancellation analysis</p></div>}
      {hasData && !hasCancellations && <div className="text-center py-4 text-green-600"><div className="flex items-center justify-center gap-2"><CheckCircle2 className="w-5 h-5" /><span className="font-medium">Perfect schedule execution - no cancellations!</span></div></div>}
    </div>
  );
};

export default ScheduleHealthPanel;
