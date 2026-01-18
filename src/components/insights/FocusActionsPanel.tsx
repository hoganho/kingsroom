// components/insights/FocusActionsPanel.tsx
// Focus Actions checklist panel for AI Insights

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { FocusAction } from '../../types/insights';

interface FocusActionsPanelProps {
  actions: FocusAction[];
}

const priorityConfig: Record<string, { variant: 'error' | 'warning' | 'default'; order: number }> = {
  HIGH: { variant: 'error', order: 0 },
  MEDIUM: { variant: 'warning', order: 1 },
  LOW: { variant: 'default', order: 2 },
};

export const FocusActionsPanel: React.FC<FocusActionsPanelProps> = ({ actions }) => {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  if (!actions || actions.length === 0) return null;

  // Sort by priority
  const sortedActions = [...actions].sort((a, b) => {
    return (priorityConfig[a.priority]?.order ?? 2) - (priorityConfig[b.priority]?.order ?? 2);
  });

  const handleToggle = (idx: number) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(idx)) {
      newChecked.delete(idx);
    } else {
      newChecked.add(idx);
    }
    setCheckedItems(newChecked);
  };

  const completedCount = checkedItems.size;
  const totalCount = actions.length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Focus Actions</h3>
        <div className="text-sm text-gray-500">
          {completedCount} of {totalCount} completed
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>
      
      <div className="space-y-3">
        {sortedActions.map((action, idx) => {
          const isChecked = checkedItems.has(idx);
          const config = priorityConfig[action.priority] || priorityConfig.MEDIUM;
          
          return (
            <div 
              key={idx}
              className={`p-4 rounded-lg border transition-colors ${
                isChecked 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => handleToggle(idx)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isChecked
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {isChecked && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium ${isChecked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {action.action}
                    </span>
                    <Badge variant={config.variant}>{action.priority}</Badge>
                  </div>
                  
                  {!isChecked && (
                    <>
                      <p className="text-sm text-gray-600 mb-2">{action.rationale}</p>
                      
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {action.owner && (
                          <span className="flex items-center gap-1">
                            <span>👤</span> {action.owner}
                          </span>
                        )}
                        {action.dueBy && (
                          <span className="flex items-center gap-1">
                            <span>📅</span> {action.dueBy}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default FocusActionsPanel;
