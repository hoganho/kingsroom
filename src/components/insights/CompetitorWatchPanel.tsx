// components/insights/CompetitorWatchPanel.tsx
import React from 'react';
import { Eye, AlertTriangle, Swords, Shield, Activity, TrendingUp, Target } from 'lucide-react';
import type { CompetitorWatch, PressureLevel } from '../../types/insights';

interface CompetitorWatchPanelProps { watch: CompetitorWatch; }

const pressureConfig: Record<PressureLevel, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; description: string }> = {
  HIGH: { color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: <AlertTriangle className="w-5 h-5" />, description: 'Significant competitive pressure detected' },
  MEDIUM: { color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: <Activity className="w-5 h-5" />, description: 'Moderate competitive activity in your market' },
  LOW: { color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200', icon: <TrendingUp className="w-5 h-5" />, description: 'Low competitive pressure - favorable conditions' },
  MINIMAL: { color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', icon: <Shield className="w-5 h-5" />, description: 'Minimal competitive activity detected' },
};

export const CompetitorWatchPanel: React.FC<CompetitorWatchPanelProps> = ({ watch }) => {
  if (!watch) return null;
  const config = pressureConfig[watch.pressureLevel] || pressureConfig.MINIMAL;
  const hasClashes = watch.directClashes > 0;
  const hasImpactedGames = watch.impactedGames && watch.impactedGames.length > 0;
  const hasHighlights = watch.competitorHighlights && watch.competitorHighlights.length > 0;
  const hasDefensiveActions = watch.defensiveActions && watch.defensiveActions.length > 0;

  return (
    <div className={`bg-white rounded-xl border p-6 ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-white"><Eye className="w-5 h-5 text-gray-600" /></div><div><h3 className="text-lg font-semibold text-gray-900">Competitor Watch</h3><p className="text-sm text-gray-500">{config.description}</p></div></div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} bg-white`}>{config.icon}{watch.pressureLevel} Pressure</span>
      </div>
      <div className="mb-6"><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-gray-700">Competitive Pressure Score</span><span className="text-sm font-bold text-gray-900">{watch.pressureScore}/10</span></div><div className="h-3 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${watch.pressureScore >= 7 ? 'bg-red-500' : watch.pressureScore >= 4 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${(watch.pressureScore / 10) * 100}%` }} /></div></div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-3 bg-white bg-opacity-60 rounded-lg"><div className={`text-2xl font-bold ${watch.directClashes > 3 ? 'text-red-600' : watch.directClashes > 0 ? 'text-amber-600' : 'text-green-600'}`}>{watch.directClashes}</div><div className="text-xs text-gray-500">Direct Clashes</div></div>
        <div className="text-center p-3 bg-white bg-opacity-60 rounded-lg"><div className={`text-2xl font-bold ${hasImpactedGames ? 'text-amber-600' : 'text-green-600'}`}>{watch.impactedGames?.length || 0}</div><div className="text-xs text-gray-500">Games Impacted</div></div>
      </div>
      {hasImpactedGames && <div className="mb-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Swords className="w-4 h-4 text-red-500" />Games Facing Competition</h4><div className="flex flex-wrap gap-2">{watch.impactedGames.map((game, idx) => <span key={idx} className="px-2.5 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">{game}</span>)}</div></div>}
      {hasHighlights && <div className="mb-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" />Competitor Activity</h4><ul className="space-y-2">{watch.competitorHighlights.map((highlight, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-gray-700"><span className="text-blue-500 mt-1">•</span>{highlight}</li>)}</ul></div>}
      {hasDefensiveActions && <div className="p-4 bg-white bg-opacity-60 rounded-lg border border-blue-200"><h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2"><Shield className="w-4 h-4" />Defensive Actions</h4><ul className="space-y-2">{watch.defensiveActions.map((action, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-blue-700"><Target className="w-3 h-3 mt-1 flex-shrink-0" />{action}</li>)}</ul></div>}
      {!hasClashes && !hasHighlights && <div className="text-center py-4 text-green-600"><div className="flex items-center justify-center gap-2"><Shield className="w-5 h-5" /><span className="font-medium">No significant competitor activity detected</span></div></div>}
    </div>
  );
};

export default CompetitorWatchPanel;
