// components/insights/OverlayReportPanel.tsx
import React from 'react';
import { AlertTriangle, DollarSign, TrendingDown, Percent, Target, AlertCircle, Lightbulb, BarChart3 } from 'lucide-react';
import type { OverlayReport } from '../../types/insights';

interface OverlayReportPanelProps { report: OverlayReport; }

const formatCurrency = (value: number): string => { const isNeg = value < 0; const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value)); return isNeg ? `-${f}` : f; };
const formatPercent = (value: number | null | undefined): string => value === null || value === undefined ? 'N/A' : `${value.toFixed(1)}%`;

const getOverlaySeverity = (overlay: number, guarantee: number): string => {
  const percentage = guarantee > 0 ? (overlay / guarantee) * 100 : 0;
  if (percentage >= 50) return 'critical';
  if (percentage >= 30) return 'high';
  if (percentage >= 15) return 'medium';
  return 'low';
};

const severityConfig: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  high: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  low: { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
};

export const OverlayReportPanel: React.FC<OverlayReportPanelProps> = ({ report }) => {
  if (!report) return null;
  const hasOverlays = report.gamesWithOverlay > 0;
  const overlayPercentOfLoss = report.overlayAsPercentOfLoss;
  const isSignificant = overlayPercentOfLoss !== null && overlayPercentOfLoss > 50;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 ${hasOverlays ? 'border-l-4 border-l-red-500' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasOverlays ? 'bg-red-100' : 'bg-green-100'}`}><DollarSign className={`w-5 h-5 ${hasOverlays ? 'text-red-600' : 'text-green-600'}`} /></div>
          <div><h3 className="text-lg font-semibold text-gray-900">Overlay Analysis</h3><p className="text-sm text-gray-500">Guarantee performance & overlay costs</p></div>
        </div>
        {isSignificant && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3" />Major Profit Drain</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${report.totalOverlayCost > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(report.totalOverlayCost)}</div><div className="text-xs text-gray-500">Total Overlay Cost</div></div>
        <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-2xl font-bold text-gray-900">{report.gamesWithOverlay}</div><div className="text-xs text-gray-500">Games with Overlay</div></div>
        <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${report.avgCoverageRate >= 100 ? 'text-green-600' : report.avgCoverageRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{formatPercent(report.avgCoverageRate)}</div><div className="text-xs text-gray-500">Avg Coverage Rate</div></div>
        <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-2xl font-bold ${overlayPercentOfLoss !== null && overlayPercentOfLoss > 50 ? 'text-red-600' : 'text-gray-900'}`}>{overlayPercentOfLoss !== null ? `${overlayPercentOfLoss.toFixed(0)}%` : 'N/A'}</div><div className="text-xs text-gray-500">% of Total Loss</div></div>
      </div>
      {report.worstOverlays && report.worstOverlays.length > 0 && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" />Worst Performing Guarantees</h4>
          <div className="space-y-2">
            {report.worstOverlays.slice(0, 5).map((item, idx) => {
              const severity = getOverlaySeverity(item.overlay, item.guarantee);
              const config = severityConfig[severity];
              return (
                <div key={idx} className={`p-3 rounded-lg border ${config.bg} ${config.border}`}>
                  <div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="font-medium text-gray-900 truncate">{item.gameName}</div><div className="text-sm text-gray-600">{item.venueName}</div></div><div className="text-right ml-4"><div className={`font-bold ${config.color}`}>-{formatCurrency(item.overlay)}</div><div className="text-xs text-gray-500">overlay</div></div></div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-600"><span className="flex items-center gap-1"><Target className="w-3 h-3" />GTD: {formatCurrency(item.guarantee)}</span><span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{item.entries} entries</span><span className="flex items-center gap-1"><Percent className="w-3 h-3" />{formatPercent(item.coverageRate)} coverage</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {report.guaranteesNeedingReview && report.guaranteesNeedingReview.length > 0 && <div className="mb-6"><h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" />Guarantees Needing Review</h4><div className="flex flex-wrap gap-2">{report.guaranteesNeedingReview.map((game, idx) => <span key={idx} className="px-2.5 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">{game}</span>)}</div></div>}
      {report.recommendation && <div className="p-4 bg-blue-50 rounded-lg border border-blue-200"><div className="flex items-start gap-3"><Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" /><div><h4 className="font-semibold text-blue-800 mb-1">Recommendation</h4><p className="text-sm text-blue-700">{report.recommendation}</p></div></div></div>}
      {!hasOverlays && <div className="text-center py-4 text-green-600"><div className="flex items-center justify-center gap-2"><Target className="w-5 h-5" /><span className="font-medium">No overlays this period - all guarantees covered!</span></div></div>}
    </div>
  );
};

export default OverlayReportPanel;
