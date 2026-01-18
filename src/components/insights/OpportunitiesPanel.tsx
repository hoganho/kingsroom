// components/insights/OpportunitiesPanel.tsx
// Opportunities panel for AI Insights

import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { Opportunity } from '../../types/insights';

interface OpportunitiesPanelProps {
  opportunities: Opportunity[];
}

const effortConfig: Record<string, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  LOW: { variant: 'success', label: 'Low Effort' },
  MEDIUM: { variant: 'warning', label: 'Medium Effort' },
  HIGH: { variant: 'error', label: 'High Effort' },
};

export const OpportunitiesPanel: React.FC<OpportunitiesPanelProps> = ({ opportunities }) => {
  if (!opportunities || opportunities.length === 0) return null;

  // Sort by effort (low first)
  const sortedOpps = [...opportunities].sort((a, b) => {
    const order: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return (order[a.effort] || 1) - (order[b.effort] || 1);
  });

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Opportunities</h3>
      
      <div className="space-y-4">
        {sortedOpps.map((opp, idx) => {
          const config = effortConfig[opp.effort] || effortConfig.MEDIUM;
          
          return (
            <div 
              key={idx} 
              className="p-4 bg-green-50 rounded-lg border border-green-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">💡</span>
                    <h4 className="font-medium text-green-900">{opp.title}</h4>
                  </div>
                  <p className="text-sm text-green-800 mb-2">{opp.description}</p>
                  
                  {opp.potentialImpact && (
                    <p className="text-sm text-green-700">
                      <strong>Potential Impact:</strong> {opp.potentialImpact}
                    </p>
                  )}
                </div>
                
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={config.variant}>
                    {config.label}
                  </Badge>
                  {opp.timeframe && (
                    <span className="text-xs text-gray-500">{opp.timeframe}</span>
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

export default OpportunitiesPanel;
