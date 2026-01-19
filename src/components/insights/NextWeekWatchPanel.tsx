// components/insights/NextWeekWatchPanel.tsx
import React from 'react';
import { Calendar, AlertTriangle, Lightbulb, Eye, Swords, Target, Shield, TrendingUp } from 'lucide-react';
import type { NextWeekWatch } from '../../types/insights';

interface NextWeekWatchPanelProps { watch: NextWeekWatch; }

export const NextWeekWatchPanel: React.FC<NextWeekWatchPanelProps> = ({ watch }) => {
  if (!watch) return null;
  const hasRisks = watch.gamesAtRisk && watch.gamesAtRisk.length > 0;
  const hasOpportunities = watch.opportunities && watch.opportunities.length > 0;
  const hasCompetitorEvents = watch.competitorEvents && watch.competitorEvents.length > 0;
  const hasFocusAreas = watch.focusAreas && watch.focusAreas.length > 0;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
      <div className="flex items-center gap-3 mb-6"><div className="p-2 rounded-lg bg-indigo-100"><Calendar className="w-5 h-5 text-indigo-600" /></div><div><h3 className="text-lg font-semibold text-gray-900">Next Week Watch</h3><p className="text-sm text-gray-500">Forward-looking insights and focus areas</p></div></div>
      {hasFocusAreas && <div className="mb-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-500" />Key Focus Areas</h4><div className="flex flex-wrap gap-2">{watch.focusAreas.map((area, idx) => <span key={idx} className="px-2.5 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">{area}</span>)}</div></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Games at Risk{hasRisks && <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{watch.gamesAtRisk.length}</span>}</h4>
          {hasRisks ? (
            <div className="space-y-2">{watch.gamesAtRisk.slice(0, 4).map((item, idx) => <div key={idx} className="p-3 rounded-lg bg-white border border-red-200"><div className="font-medium text-gray-900 mb-1">{item.game}</div><div className="text-sm text-red-600 mb-2"><span className="font-medium">Risk: </span>{item.risk}</div>{item.mitigation && <div className="flex items-start gap-2 text-sm text-blue-700 p-2 bg-blue-50 rounded"><Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />{item.mitigation}</div>}</div>)}</div>
          ) : <div className="text-center py-6 text-green-600 bg-white rounded-lg border border-green-200"><TrendingUp className="w-8 h-8 mx-auto mb-2" /><p className="text-sm font-medium">No games at risk!</p></div>}
        </div>
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-green-500" />Opportunities{hasOpportunities && <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{watch.opportunities.length}</span>}</h4>
          {hasOpportunities ? (
            <div className="space-y-2">{watch.opportunities.slice(0, 4).map((item, idx) => <div key={idx} className="p-3 rounded-lg bg-white border border-green-200"><div className="font-medium text-gray-900 mb-1">{item.game}</div><div className="text-sm text-green-600 mb-2"><span className="font-medium">Opportunity: </span>{item.opportunity}</div>{item.action && <div className="flex items-start gap-2 text-sm text-blue-700 p-2 bg-blue-50 rounded"><Target className="w-3 h-3 mt-0.5 flex-shrink-0" />{item.action}</div>}</div>)}</div>
          ) : <div className="text-center py-6 text-gray-500 bg-white rounded-lg border border-gray-200"><Eye className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p className="text-sm">No specific opportunities identified</p></div>}
        </div>
      </div>
      {hasCompetitorEvents && <div className="mt-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Swords className="w-4 h-4 text-amber-500" />Competitor Events to Monitor</h4><div className="p-3 bg-white rounded-lg border border-amber-200"><ul className="space-y-2">{watch.competitorEvents.map((event, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-gray-700"><Eye className="w-3 h-3 mt-1 text-amber-500 flex-shrink-0" />{event}</li>)}</ul></div></div>}
    </div>
  );
};

export default NextWeekWatchPanel;
