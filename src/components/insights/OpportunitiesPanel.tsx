// components/insights/OpportunitiesPanel.tsx
import React from 'react';
import { Lightbulb, Calendar, TrendingUp, Clock, Target, Zap, ArrowRight } from 'lucide-react';
import type { OpportunitiesReport } from '../../types/insights';

interface OpportunitiesPanelProps { opportunities: OpportunitiesReport; }

export const OpportunitiesPanel: React.FC<OpportunitiesPanelProps> = ({ opportunities }) => {
  if (!opportunities) return null;
  const hasQuickWins = opportunities.quickWins && opportunities.quickWins.length > 0;
  const hasScheduleGaps = opportunities.scheduleGaps && opportunities.scheduleGaps.length > 0;
  const hasExpansionCandidates = opportunities.expansionCandidates && opportunities.expansionCandidates.length > 0;
  const isEmpty = !hasQuickWins && !hasScheduleGaps && !hasExpansionCandidates;
  if (isEmpty) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6"><div className="p-2 rounded-lg bg-green-100"><Lightbulb className="w-5 h-5 text-green-600" /></div><div><h3 className="text-lg font-semibold text-gray-900">Opportunities</h3><p className="text-sm text-gray-500">Growth opportunities detected from your data</p></div></div>
      {hasQuickWins && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" />Quick Wins<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 ml-2">This Week</span></h4>
          <div className="space-y-3">
            {opportunities.quickWins.map((win, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1"><h5 className="font-medium text-gray-900 mb-1">{win.opportunity}</h5>{win.potentialImpact && <div className="flex items-center gap-2 text-sm text-green-700 mb-2"><TrendingUp className="w-4 h-4" /><span className="font-medium">Potential Impact:</span>{win.potentialImpact}</div>}{win.action && <div className="flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded"><Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /><div><span className="text-xs font-semibold text-blue-700 uppercase">Action</span><p className="text-sm text-gray-700">{win.action}</p></div></div>}</div>
                  {win.deadline && <span className="ml-4 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock className="w-3 h-3" />{win.deadline}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {hasScheduleGaps && <div><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" />Schedule Gaps</h4><div className="space-y-2">{opportunities.scheduleGaps.map((gap, idx) => <div key={idx} className="p-3 rounded-lg bg-blue-50 border border-blue-200"><div className="flex items-center gap-2"><ArrowRight className="w-4 h-4 text-blue-500" /><span className="text-sm text-blue-800">{gap}</span></div></div>)}</div></div>}
        {hasExpansionCandidates && <div><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" />Expansion Candidates</h4><div className="space-y-2">{opportunities.expansionCandidates.map((candidate, idx) => <div key={idx} className="p-3 rounded-lg bg-purple-50 border border-purple-200"><div className="flex items-center gap-2"><ArrowRight className="w-4 h-4 text-purple-500" /><span className="text-sm text-purple-800">{candidate}</span></div></div>)}</div></div>}
      </div>
    </div>
  );
};

export default OpportunitiesPanel;
