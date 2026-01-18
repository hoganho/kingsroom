// components/insights/ExecutiveSummary.tsx
// Executive Summary section of AI Insights report

import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { ExecutiveSummary as ExecutiveSummaryType, ReportHealthStatus } from '../../types/insights';

interface ExecutiveSummaryProps {
  summary: ExecutiveSummaryType;
}

const healthConfig: Record<ReportHealthStatus, { variant: 'success' | 'warning' | 'error'; label: string }> = {
  EXCELLENT: { variant: 'success', label: 'Excellent' },
  GOOD: { variant: 'success', label: 'Good' },
  NEEDS_ATTENTION: { variant: 'warning', label: 'Needs Attention' },
  CRITICAL: { variant: 'error', label: 'Critical' },
};

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ summary }) => {
  const config = healthConfig[summary.overallHealth] || healthConfig.GOOD;
  
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Executive Summary</h2>
        <Badge variant={config.variant}>
          {config.label}
        </Badge>
      </div>
      
      {/* Headline */}
      <p className="text-lg text-gray-800 mb-4 leading-relaxed">
        {summary.headline}
      </p>
      
      {/* Health Rationale */}
      {summary.healthRationale && (
        <p className="text-sm text-gray-600 mb-4 italic border-l-2 border-gray-300 pl-3">
          {summary.healthRationale}
        </p>
      )}
      
      {/* Key Takeaways */}
      {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Key Takeaways</h4>
          <ul className="space-y-2">
            {summary.keyTakeaways.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default ExecutiveSummary;
