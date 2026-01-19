// components/insights/FocusActionsPanel.tsx
// Focus Actions panel - Interactive checklist with progress tracking

import React, { useState } from 'react';
import { Clock, User, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { FocusAction } from '../../types/insights';

interface FocusActionsPanelProps {
  actions: FocusAction[];
  onToggle?: (index: number, completed: boolean) => void;
}

export const FocusActionsPanel: React.FC<FocusActionsPanelProps> = ({ actions, onToggle }) => {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  if (!actions || actions.length === 0) return null;

  const sortedActions = [...actions].sort((a, b) => a.priority - b.priority);

  const handleToggle = (idx: number) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(idx)) newChecked.delete(idx);
    else newChecked.add(idx);
    setCheckedItems(newChecked);
    if (onToggle) onToggle(idx, !checkedItems.has(idx));
  };

  const completedCount = checkedItems.size;
  const totalCount = actions.length;
  const progressPercent = (completedCount / totalCount) * 100;

  const getPriorityBadge = (priority: number) => {
    if (priority === 1) return { color: 'bg-red-100 text-red-700', label: 'P1 - Critical' };
    if (priority === 2) return { color: 'bg-amber-100 text-amber-700', label: 'P2 - High' };
    if (priority === 3) return { color: 'bg-gray-100 text-gray-700', label: 'P3 - Medium' };
    return { color: 'bg-gray-100 text-gray-700', label: `P${priority}` };
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100"><Target className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">This Week's Actions</h3>
            <p className="text-sm text-gray-500">Priority tasks from AI analysis</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm text-gray-500">Progress</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{completedCount}/{totalCount}</span>
            {completedCount === totalCount && totalCount > 0 && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </div>
        </div>
      </div>

      <div className="h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="space-y-3">
        {sortedActions.map((action, idx) => {
          const isChecked = checkedItems.has(idx);
          const priorityBadge = getPriorityBadge(action.priority);
          
          return (
            <div key={idx} className={`p-4 rounded-lg border transition-all ${
              isChecked ? 'bg-green-50 border-green-200' : 
              action.priority === 1 ? 'bg-red-50 border-red-200' :
              action.priority === 2 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}>
              <div className="flex items-start gap-3">
                <button onClick={() => handleToggle(idx)} className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                  isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-gray-400'
                }`}>
                  {isChecked && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`font-medium ${isChecked ? 'line-through text-gray-400' : 'text-gray-900'}`}>{action.action}</span>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge.color}`}>{priorityBadge.label}</span>
                  </div>
                  
                  {!isChecked && (
                    <>
                      {action.rationale && <p className="text-sm text-gray-600 mb-3">{action.rationale}</p>}
                      {action.expectedImpact && (
                        <div className="flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded mb-3">
                          <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div><span className="text-xs font-semibold text-blue-700 uppercase">Expected Impact</span><p className="text-sm text-gray-700">{action.expectedImpact}</p></div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {action.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{action.owner}</span>}
                        {action.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{action.deadline}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FocusActionsPanel;
