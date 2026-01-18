// components/insights/ReportMetadata.tsx
// Report metadata display for AI Insights

import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { DirectorReport, MetricsPack } from '../../types/insights';

interface ReportMetadataProps {
  report: DirectorReport | null;
  metricsPack: MetricsPack | null;
}

export const ReportMetadata: React.FC<ReportMetadataProps> = ({ report, metricsPack }) => {
  if (!report) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Card className="p-4 bg-gray-50">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {/* Period */}
        <div>
          <span className="text-gray-500">Period: </span>
          <span className="font-medium">{metricsPack?.periodLabel || report.periodKey}</span>
        </div>
        
        {/* Generated timestamp */}
        <div>
          <span className="text-gray-500">Generated: </span>
          <span className="font-medium">{formatDate(report.generatedAt)}</span>
        </div>
        
        {/* Model */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Model: </span>
          <Badge variant="default">{report.modelName}</Badge>
        </div>
        
        {/* Version */}
        <div>
          <span className="text-gray-500">Version: </span>
          <span className="font-medium">v{report.reportVersion}</span>
        </div>
        
        {/* Cost */}
        {report.totalCost !== undefined && (
          <div>
            <span className="text-gray-500">Cost: </span>
            <span className="font-medium">${report.totalCost.toFixed(4)}</span>
          </div>
        )}
        
        {/* Duration */}
        {report.generationDurationMs && (
          <div>
            <span className="text-gray-500">Time: </span>
            <span className="font-medium">{(report.generationDurationMs / 1000).toFixed(1)}s</span>
          </div>
        )}
        
        {/* Token usage */}
        {report.inputTokens && report.outputTokens && (
          <div>
            <span className="text-gray-500">Tokens: </span>
            <span className="font-medium">
              {report.inputTokens.toLocaleString()} in / {report.outputTokens.toLocaleString()} out
            </span>
          </div>
        )}
        
        {/* Data coverage */}
        {metricsPack && (
          <div>
            <span className="text-gray-500">Data: </span>
            <span className="font-medium">
              {metricsPack.gamesIncluded} games, {metricsPack.venuesIncluded} venues
            </span>
          </div>
        )}
      </div>
      
      {/* Regeneration info */}
      {report.regeneratedAt && (
        <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-500">
          Regenerated: {formatDate(report.regeneratedAt)}
          {report.regenerationReason && ` - ${report.regenerationReason}`}
        </div>
      )}
    </Card>
  );
};

export default ReportMetadata;
